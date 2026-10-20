import * as Path from 'path';
import moment = require('moment');
import { JournalController, TextReplacement } from '../../shared/model/index';
import { DocumentText } from '../../shared/text/document-text';
import { getDateFromPath } from '../../shared/paths';
import { daysOfWeek, fileLink, resolveDate } from 'journal-core';
import { replaceVariableValue } from '../../shared/index';
import { fileExists } from '../../shared/fs/fs-exists';

/**
 * The date line of a weekly entry as the sync writes it: an italic sentence
 * (`*From Monday, October 11th to Friday, October 15th*`, see weekDatesLine);
 * also the `06-22 .. 06-28` of earlier versions, which it replaces.
 */
const DATE_LINE = /^(\*(From [^*]+ to |Vom [^*]+ bis )[^*]+\*|\*[^*]+ – [^*]+\*|\d{2}-\d{2} \.\. \d{2}-\d{2})\s*$/;

/** How the date line reads in a journal locale: the day format and the sentence; other locales use the long date and a dash. */
const DATE_SENTENCES: Record<string, { day: string; sentence: (from: string, to: string) => string }> = {
    en: { day: 'dddd, MMMM Do', sentence: (from, to) => `From ${from} to ${to}` },
    'en-gb': { day: 'dddd, D MMMM', sentence: (from, to) => `From ${from} to ${to}` },
    de: { day: 'dddd, D. MMMM', sentence: (from, to) => `Vom ${from} bis ${to}` },
};

/**
 * The date line of a week (#311), in the journal locale: from its first to
 * its last day, weekend included (Monday to Sunday or Sunday to Saturday,
 * depending on the locale), e.g. `*From Sunday, October 10th to Saturday,
 * October 16th*` or `*Vom Montag, 11. Oktober bis Sonntag, 17. Oktober*`.
 */
export function weekDatesLine(days: Date[], locale: string): string {
    const [first, last] = [days[0], days[days.length - 1]];
    const tag = locale.toLowerCase().replace('_', '-');
    const format = DATE_SENTENCES[tag] ?? DATE_SENTENCES[tag.split('-')[0]];
    const day = (date: Date) => moment(date).locale(locale).format(format?.day ?? 'dddd, LL');
    return `*${format ? format.sentence(day(first), day(last)) : `${day(first)} – ${day(last)}`}*`;
}

/**
 * The edit that keeps the top of a weekly entry in shape (#311):
 *
 * - the date line (`06-22 .. 06-28`, if given) directly under the title,
 * - the anchor section with the block as the first section under the title:
 *   before the first other section, after any lines right under the title
 *   (memos). A section elsewhere is moved up, a missing one is added; its
 *   block is everything from the line after the anchor up to (not including)
 *   the next markdown heading at any level, or the end of the text.
 *
 * The edit replaces only what differs, so an open editor keeps its cursor.
 * 'up-to-date' if the entry is already as it should be (idempotent).
 */
export function dailyLinksEdit(text: string, anchor: string, block: string, dateLine?: string): TextReplacement | 'up-to-date' {
    const doc = new DocumentText(text);
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const wanted = weeklyTop(Array.from({ length: doc.lineCount }, (_, i) => doc.lineText(i)), anchor, block.trim(), dateLine).join(eol);
    if (wanted === text) { return 'up-to-date'; }

    let prefix = 0;
    while (prefix < text.length && prefix < wanted.length && text[prefix] === wanted[prefix]) { prefix++; }
    let suffix = 0;
    while (suffix < text.length - prefix && suffix < wanted.length - prefix && text[text.length - 1 - suffix] === wanted[wanted.length - 1 - suffix]) { suffix++; }
    // never split a \r\n
    if (prefix > 0 && text[prefix - 1] === '\r') { prefix--; }
    return { start: doc.positionAt(prefix), end: doc.positionAt(text.length - suffix), value: wanted.slice(prefix, wanted.length - suffix) };
}

/** The lines of a weekly entry with the date line and the anchor section in place. */
function weeklyTop(lines: string[], anchor: string, block: string, dateLine?: string): string[] {
    const isHeading = (line: string) => /^#+\s/.test(line);
    const sectionEnd = (from: number) => {
        for (let i = from + 1; i < lines.length; i++) {
            if (isHeading(lines[i])) { return i; }
        }
        return lines.length;
    };
    const sectionLines = [anchor, '', ...(block.length > 0 ? block.split(/\r?\n/) : []), ''];

    // the date line directly under the title; one that a memo pushed down (memos go under the title) moves back up
    const title = lines.findIndex(l => /^#\s/.test(l));
    if (dateLine && title !== -1) {
        const preambleEnd = lines.findIndex((l, i) => i > title && isHeading(l));
        const existing = lines.findIndex((l, i) => i > title && (preambleEnd === -1 || i < preambleEnd) && DATE_LINE.test(l));
        if (existing !== -1) { lines.splice(existing, 1); }
        lines.splice(title + 1, 0, dateLine);
    }

    const anchorLine = lines.findIndex(l => l.trimEnd() === anchor);
    const firstSection = lines.findIndex((l, i) => i > title && isHeading(l));
    if (anchorLine !== -1 && anchorLine === firstSection) {
        // in place: only the block
        const blockEnd = sectionEnd(anchorLine);
        const existing = lines.slice(anchorLine + 1, blockEnd).map(l => l.trimEnd()).join('\n').trim();
        if (existing === block) { return lines; }
        const tail = blockEnd < lines.length ? lines.slice(blockEnd) : [''];
        return [...lines.slice(0, anchorLine), ...sectionLines, ...tail];
    }

    // the section is elsewhere (or missing): take it out and put it first under the title
    if (anchorLine !== -1) { lines.splice(anchorLine, sectionEnd(anchorLine) - anchorLine); }
    const restTitle = lines.findIndex(l => /^#\s/.test(l));
    let insertAt = lines.findIndex((l, i) => i > restTitle && isHeading(l));
    if (insertAt === -1) { insertAt = lines.length; }
    const before = lines.slice(0, insertAt);
    while (before.length > 0 && before[before.length - 1].trim() === '') { before.pop(); }
    const after = lines.slice(insertAt);
    return [...(before.length > 0 ? [...before, ''] : []), ...sectionLines, ...(after.length > 0 ? after : [''])];
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
