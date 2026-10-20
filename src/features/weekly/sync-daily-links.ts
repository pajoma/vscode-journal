import * as Path from 'path';
import { JournalController, TextReplacement } from '../../shared/model/index';
import { DocumentText } from '../../shared/text/document-text';
import { getDateFromPath } from '../../shared/paths';
import { daysOfWeek, fileLink, resolveDate } from 'journal-core';
import { replaceVariableValue } from '../../shared/index';
import { fileExists } from '../../shared/fs/fs-exists';

/**
 * The edit that puts the link block under the anchor heading: it replaces
 * everything from the line after the anchor up to (not including) the next
 * markdown heading at any level, or the end of the text. 'up-to-date' if
 * the block is already there (idempotent).
 */
export function dailyLinksEdit(text: string, anchor: string, block: string): TextReplacement | 'no-anchor' | 'up-to-date' {
    const doc = new DocumentText(text);
    const lines = Array.from({ length: doc.lineCount }, (_, i) => doc.lineText(i));

    // Anchor line: exact match after trimming trailing whitespace.
    const anchorLine = lines.findIndex(l => l.trimEnd() === anchor);
    if (anchorLine === -1) { return 'no-anchor'; }

    let blockEnd = lines.length;
    for (let i = anchorLine + 1; i < lines.length; i++) {
        if (/^#+\s/.test(lines[i])) { blockEnd = i; break; }
    }

    const existingBlock = lines.slice(anchorLine + 1, blockEnd).map(l => l.trimEnd()).join('\n').trim();
    const newBlock = block.trim();
    if (existingBlock === newBlock) { return 'up-to-date'; }

    // blank line, content, blank line (for markdown tidiness)
    const value = '\n' + (newBlock.length > 0 ? newBlock + '\n' : '') + '\n';
    // an anchor in the last line: the block starts at the end of the text
    const start = doc.validate({ line: anchorLine + 1, character: 0 });
    const end = blockEnd < lines.length ? { line: blockEnd, character: 0 } : doc.end();
    return { start, end, value };
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

        const dailies = await this.findDailyEntriesForWeek(week, year, scope);
        const block = await this.renderBlock(weeklyPath, dailies, scope);
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
        const dates = daysOfWeek(week, year, this.ctrl.config.getLocale());
        const result: string[] = [];

        for (const date of dates) {
            for (const candidate of this.ctrl.config.getEntryPaths(date, scope)) {
                const fullPath = Path.normalize(candidate);
                if (await fileExists(this.ctrl.fs, fullPath)) {
                    result.push(fullPath);
                    break;
                }
            }
        }

        return result;
    }

    /**
     * Renders the link block (no I/O). Returns a string with one link line per
     * existing daily entry, linked relative to the weekly entry, ordered per
     * the configured sortOrder.
     */
    public async renderBlock(weeklyPath: string, dailies: string[], scope?: string): Promise<string> {
        const syncConfig = this.ctrl.config.getWeeklySyncConfig(scope);
        const tpl = this.ctrl.config.getDailyLinkInlineTemplate(scope);
        const weeklyDir = Path.parse(weeklyPath).dir;
        const locale = this.ctrl.config.getLocale();

        const lines: string[] = [];
        for (const daily of dailies) {
            const date = await getDateFromPath(daily, this.ctrl.config);
            const { title, link } = fileLink(weeklyDir, daily, this.ctrl.config.getFileExtension());

            let line = tpl.template;
            line = resolveDate(line, date, locale);
            line = replaceVariableValue("link", link, line);
            line = replaceVariableValue("title", title, line);
            lines.push(line);
        }

        if (syncConfig.sortOrder === "descending") {
            lines.reverse();
        }

        return lines.join('\n');
    }

    /**
     * Replaces (or inserts) the content under the anchor heading of the weekly
     * entry (see dailyLinksEdit) and saves it. Returns true if the entry was
     * modified, false if it was already correct or has no anchor.
     */
    public async applyBlock(weeklyPath: string, anchor: string, block: string): Promise<boolean> {
        const edit = dailyLinksEdit(await this.ctrl.editor.getText(weeklyPath), anchor, block);
        if (edit === 'no-anchor') {
            this.ctrl.logger.debug(
                "SyncDailyLinks: anchor not found in", weeklyPath,
                "— configure '## Daily Entries' or set journal.weeklySync.anchor"
            );
            return false;
        }
        if (edit === 'up-to-date') { return false; }

        await this.ctrl.editor.replace(weeklyPath, edit);
        await this.ctrl.editor.save(weeklyPath);
        return true;
    }
}
