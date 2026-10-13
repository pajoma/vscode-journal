import * as Path from 'path';
import { JournalController, TextPosition } from '../../shared/model/index';
import { DocumentText } from '../../shared/text/document-text';
import { getDateFromURIAndConfig } from '../../shared/paths';
import { daysOfWeek, resolveDate } from 'journal-core';
import { replaceVariableValue } from '../../shared/index';
import { fileExists } from '../../shared/fs/fs-exists';

/** Replaces the text from start to end with value. */
export interface TextReplacement {
    start: TextPosition;
    end: TextPosition;
    value: string;
}

/**
 * The edit that puts the link block under the anchor heading: it replaces
 * everything from the line after the anchor up to (not including) the next
 * markdown heading at any level, or the end of the text. Undefined if the
 * anchor is missing or the block is already there (idempotent).
 */
export function dailyLinksEdit(text: string, anchor: string, block: string): TextReplacement | 'no-anchor' | undefined {
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
    if (existingBlock === newBlock) { return undefined; }

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
     * sorted by date ascending. Uses stat-first fileExists — no speculative opens.
     */
    public async findDailyEntriesForWeek(week: number, year: number, scope?: string): Promise<string[]> {
        const dates = daysOfWeek(week, year, this.ctrl.config.getLocale());
        const result: string[] = [];

        for (const date of dates) {
            const pathTpl = this.ctrl.config.getResolvedEntryPath(date, scope);
            const fileTpl = this.ctrl.config.getEntryFilePattern(date, scope);
            if (!pathTpl.value || !fileTpl.value) { continue; }

            const fullPath = Path.normalize(Path.join(pathTpl.value, fileTpl.value));
            if (await fileExists(this.ctrl.fs, fullPath)) {
                result.push(fullPath);
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
            const date = await getDateFromURIAndConfig(daily, this.ctrl.config);
            const relativePath = Path.relative(weeklyDir, daily).replace(/\\/g, '/');

            let line = tpl.template;
            line = resolveDate(line, date, locale);
            line = replaceVariableValue("link", relativePath, line);
            // ${title} substitution: filename without extension
            const title = Path.parse(daily).name.replace(/_/g, ' ');
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
        if (!edit) { return false; }

        await this.ctrl.editor.replace(weeklyPath, edit.start, edit.end, edit.value);
        await this.ctrl.editor.save(weeklyPath);
        return true;
    }
}
