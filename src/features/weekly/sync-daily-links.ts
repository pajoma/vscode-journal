import * as Path from 'path';
import { JournalController, TextReplacement } from '../../shared/model/index';
import { DocumentText } from '../../shared/text/document-text';
import { getDateFromPath } from '../../shared/paths';
import { daysOfWeek, fileLink, resolveDate } from 'journal-core';
import { replaceVariableValue } from '../../shared/index';
import { fileExists } from '../../shared/fs/fs-exists';

/**
 * The edit that puts the link block under the anchor heading, and the anchor
 * section first under the entry's title (#311): before the first other
 * section, after any lines right under the title (memos). If the section is
 * there, only its block is replaced: everything from the line after the
 * anchor up to (not including) the next markdown heading at any level, or the
 * end of the text. A section elsewhere is moved up, a missing one is added.
 * 'up-to-date' if the entry is already as it should be (idempotent).
 */
export function dailyLinksEdit(text: string, anchor: string, block: string): TextReplacement | 'up-to-date' {
    const doc = new DocumentText(text);
    const lines = Array.from({ length: doc.lineCount }, (_, i) => doc.lineText(i));
    const newBlock = block.trim();
    const isHeading = (line: string) => /^#+\s/.test(line);
    const sectionEnd = (from: number) => {
        for (let i = from + 1; i < lines.length; i++) {
            if (isHeading(lines[i])) { return i; }
        }
        return lines.length;
    };

    // Anchor line: exact match after trimming trailing whitespace.
    const anchorLine = lines.findIndex(l => l.trimEnd() === anchor);
    const title = lines.findIndex(l => /^#\s/.test(l));
    const firstSection = lines.findIndex((l, i) => i > title && isHeading(l));

    if (anchorLine !== -1 && anchorLine === firstSection) {
        const blockEnd = sectionEnd(anchorLine);
        const existingBlock = lines.slice(anchorLine + 1, blockEnd).map(l => l.trimEnd()).join('\n').trim();
        if (existingBlock === newBlock) { return 'up-to-date'; }

        // blank line, content, blank line (for markdown tidiness)
        const value = '\n' + (newBlock.length > 0 ? newBlock + '\n' : '') + '\n';
        // an anchor in the last line: the block starts at the end of the text
        const start = doc.validate({ line: anchorLine + 1, character: 0 });
        const end = blockEnd < lines.length ? { line: blockEnd, character: 0 } : doc.end();
        return { start, end, value };
    }

    // the section is elsewhere (or missing): take it out and put it first under the title
    const rest = [...lines];
    if (anchorLine !== -1) { rest.splice(anchorLine, sectionEnd(anchorLine) - anchorLine); }
    const restTitle = rest.findIndex(l => /^#\s/.test(l));
    let insertAt = rest.findIndex((l, i) => i > restTitle && isHeading(l));
    if (insertAt === -1) { insertAt = rest.length; }
    const before = rest.slice(0, insertAt);
    while (before.length > 0 && before[before.length - 1].trim() === '') { before.pop(); }
    const after = rest.slice(insertAt);
    const section = [anchor, '', ...(newBlock.length > 0 ? newBlock.split(/\r?\n/) : []), ''];
    const result = [...(before.length > 0 ? [...before, ''] : []), ...section, ...(after.length > 0 ? after : [''])];
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const value = result.join(eol);
    if (value === text) { return 'up-to-date'; }
    return { start: { line: 0, character: 0 }, end: doc.end(), value };
}

export class SyncDailyLinks {

    constructor(public ctrl: JournalController) { }

    /**
     * Orchestrates the full sync cycle for a weekly entry: find existing
     * daily entries → render the link block → apply the block to the entry.
     * Short-circuits silently when weeklySync.enabled is false.
     */
    public async sync(weeklyPath: string, week: number, year: number, scope?: string): Promise<void> {
        const syncConfig = this.ctrl.config.getWeeklySyncConfig(scope);
        if (!syncConfig.enabled) { return; }

        const block = await this.renderWeek(weeklyPath, week, year, scope);
        const applied = await this.applyBlock(weeklyPath, syncConfig.anchor, block);
        if (applied) {
            this.ctrl.logger.debug("SyncDailyLinks: updated daily-entry links in", weeklyPath);
        }
    }

    /**
     * Returns the paths of existing daily entry files for the given week/year,
     * sorted by date ascending: per day the first that exists of its layouts
     * (#309), so entries written before the patterns changed are linked too.
     * Uses stat-first fileExists — no speculative opens.
     */
    public async findDailyEntriesForWeek(week: number, year: number, scope?: string): Promise<string[]> {
        const result: string[] = [];
        for (const date of daysOfWeek(week, year, this.ctrl.config.getLocale())) {
            const path = await this.existingEntry(date, scope);
            if (path) { result.push(path); }
        }
        return result;
    }

    /**
     * The link block of a week (#311). With a template that links by
     * `${link}` (a markdown link needs the file): the days that have an entry.
     * Otherwise (the default, a wiki link such as `[[${d:YYYY-MM-DD}|…]]`,
     * which creates a missing entry on Ctrl+click): the working days, Monday to
     * Friday, and the weekend days that have an entry.
     */
    public async renderWeek(weeklyPath: string, week: number, year: number, scope?: string): Promise<string> {
        const tpl = this.ctrl.config.getDailyLinkInlineTemplate(scope);
        const byLink = tpl.template.includes('${link}');
        const days: { date: Date; path?: string }[] = [];
        for (const date of daysOfWeek(week, year, this.ctrl.config.getLocale())) {
            const path = await this.existingEntry(date, scope);
            if (path || (!byLink && isWorkingDay(date))) { days.push({ date, path }); }
        }
        return this.renderDays(weeklyPath, days, scope);
    }

    /**
     * Renders the link block for the given daily entries (no I/O besides
     * their dates): one link line per entry, linked relative to the weekly
     * entry, ordered per the configured sortOrder.
     */
    public async renderBlock(weeklyPath: string, dailies: string[], scope?: string): Promise<string> {
        const days = await Promise.all(dailies.map(async path => ({ date: await getDateFromPath(path, this.ctrl.config), path })));
        return this.renderDays(weeklyPath, days, scope);
    }

    private renderDays(weeklyPath: string, days: { date: Date; path?: string }[], scope?: string): string {
        const syncConfig = this.ctrl.config.getWeeklySyncConfig(scope);
        const tpl = this.ctrl.config.getDailyLinkInlineTemplate(scope);
        const weeklyDir = Path.parse(weeklyPath).dir;
        const locale = this.ctrl.config.getLocale();

        const lines = days.map(({ date, path }) => {
            let line = resolveDate(tpl.template, date, locale);
            if (path) {
                const { title, link } = fileLink(weeklyDir, path, this.ctrl.config.getFileExtension());
                line = replaceVariableValue("link", link, line);
                line = replaceVariableValue("title", title, line);
            }
            return line;
        });

        if (syncConfig.sortOrder === "descending") {
            lines.reverse();
        }

        return lines.join('\n');
    }

    /** The daily entry of the day in the first layout that has it; undefined if none. */
    private async existingEntry(date: Date, scope?: string): Promise<string | undefined> {
        for (const candidate of this.ctrl.config.getEntryPaths(date, scope)) {
            const fullPath = Path.normalize(candidate);
            if (await fileExists(this.ctrl.fs, fullPath)) { return fullPath; }
        }
        return undefined;
    }

    /**
     * Puts the anchor section with the block first under the title of the
     * weekly entry (see dailyLinksEdit) and saves it. Returns true if the entry
     * was modified, false if it was already correct.
     */
    public async applyBlock(weeklyPath: string, anchor: string, block: string): Promise<boolean> {
        const edit = dailyLinksEdit(await this.ctrl.editor.getText(weeklyPath), anchor, block);
        if (edit === 'up-to-date') { return false; }

        await this.ctrl.editor.replace(weeklyPath, edit);
        await this.ctrl.editor.save(weeklyPath);
        return true;
    }
}

/** Monday to Friday. */
function isWorkingDay(date: Date): boolean {
    return date.getDay() >= 1 && date.getDay() <= 5;
}
