import * as Path from 'path';
import { JournalController, TextReplacement } from '../../shared/model/index';
import { DocumentText, replacementFor } from '../../shared/text/document-text';
import { getDateFromPath } from '../../shared/paths';
import { dailyLinkLine, daysOfWeek, linkedDays, weekDatesLine, weeklyTop } from 'journal-core';
import { fileExists } from '../../shared/fs/fs-exists';

/**
 * The edit that keeps the top of a weekly entry in shape (#311): the rules
 * are journal-core's weeklyTop (date line, `## Daily Entries` first, its
 * links), shared with the MCP server (#320). The edit replaces only what
 * differs, so an open editor keeps its cursor. 'up-to-date' if the entry is
 * already as it should be (idempotent).
 */
export function dailyLinksEdit(text: string, anchor: string, block: string, dateLine?: string): TextReplacement | 'up-to-date' {
    const doc = new DocumentText(text);
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const wanted = weeklyTop(Array.from({ length: doc.lineCount }, (_, i) => doc.lineText(i)), anchor, block, dateLine).join(eol);
    return replacementFor(text, wanted) ?? 'up-to-date';
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
        const applied = await this.applyBlock(weeklyPath, syncConfig.anchor, block, this.dateLine(week, year));
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
        const week7 = await Promise.all(daysOfWeek(week, year, this.ctrl.config.getLocale())
            .map(async date => ({ date, path: await this.existingEntry(date, scope) })));
        // which days journal-core's rule links (the same in the MCP server, #320)
        const linked = new Set(linkedDays(week7.map(d => d.date), date => week7.some(d => d.date === date && d.path !== undefined), tpl.template));
        return this.renderDays(weeklyPath, week7.filter(d => linked.has(d.date)), scope);
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
        const ext = this.ctrl.config.getFileExtension();

        const lines = days.map(({ date, path }) => dailyLinkLine(tpl.template, date, locale, path ? { weeklyDir, file: path, ext } : undefined));

        if (syncConfig.sortOrder === "descending") {
            lines.reverse();
        }

        return lines.join('\n');
    }

    /** The days of the week as a sentence in the journal locale (#311), see weekDatesLine. */
    public dateLine(week: number, year: number): string {
        const locale = this.ctrl.config.getLocale();
        return weekDatesLine(daysOfWeek(week, year, locale), locale);
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
    public async applyBlock(weeklyPath: string, anchor: string, block: string, dateLine?: string): Promise<boolean> {
        const edit = dailyLinksEdit(await this.ctrl.editor.getText(weeklyPath), anchor, block, dateLine);
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
