// Copyright (C) 2026 Patrick Maué
//
// This file is part of vscode-journal.
//
// vscode-journal is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// vscode-journal is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with vscode-journal.  If not, see <http://www.gnu.org/licenses/>.

import moment from 'moment';
import { fileLink } from './links';
import { replaceVariable, resolveDate } from './template';

/**
 * The top of a weekly entry (#311), the same in the extension (weekly sync)
 * and the MCP server (new weekly entries, #320): the dates of the week as a
 * sentence directly under the title, and the section that links the days
 * (`## Daily Entries`) as the first section. No I/O: the hosts say which
 * days have an entry.
 */

/**
 * The date line as the sync writes it: an italic sentence
 * (`*From Sunday, October 10th to Saturday, October 16th*`, see weekDatesLine);
 * also the `06-22 .. 06-28` of earlier versions, which it replaces.
 */
export const WEEK_DATE_LINE = /^(\*(From [^*]+ to |Vom [^*]+ bis )[^*]+\*|\*[^*]+ – [^*]+\*|\d{2}-\d{2} \.\. \d{2}-\d{2})\s*$/;

/** How the date line reads in a journal locale: the day format and the sentence; other locales use the long date and a dash. */
const DATE_SENTENCES: Record<string, { day: string; sentence: (from: string, to: string) => string }> = {
    en: { day: 'dddd, MMMM Do', sentence: (from, to) => `From ${from} to ${to}` },
    'en-gb': { day: 'dddd, D MMMM', sentence: (from, to) => `From ${from} to ${to}` },
    de: { day: 'dddd, D. MMMM', sentence: (from, to) => `Vom ${from} bis ${to}` },
};

/**
 * The date line of a week, in the journal locale: from its first to its last
 * day, weekend included (Monday to Sunday or Sunday to Saturday, depending on
 * the locale), e.g. `*From Sunday, October 10th to Saturday, October 16th*` or
 * `*Vom Montag, 11. Oktober bis Sonntag, 17. Oktober*`.
 */
export function weekDatesLine(days: Date[], locale: string): string {
    const [first, last] = [days[0], days[days.length - 1]];
    const tag = locale.toLowerCase().replace('_', '-');
    const format = DATE_SENTENCES[tag] ?? DATE_SENTENCES[tag.split('-')[0]];
    const day = (date: Date) => moment(date).locale(locale).format(format?.day ?? 'dddd, LL');
    return `*${format ? format.sentence(day(first), day(last)) : `${day(first)} – ${day(last)}`}*`;
}

/** Monday to Friday. */
export function isWorkingDay(date: Date): boolean {
    return date.getDay() >= 1 && date.getDay() <= 5;
}

/**
 * The days a weekly entry links (in the order of the week): with a template
 * that links by `${link}` (a markdown link needs the file) the days that have
 * an entry; otherwise (a wiki link, which creates a missing entry) the
 * working days, Monday to Friday, and the weekend days that have an entry.
 */
export function linkedDays(days: Date[], hasEntry: (date: Date) => boolean, template: string): Date[] {
    const byLink = template.includes('${link}');
    return days.filter(date => hasEntry(date) || (!byLink && isWorkingDay(date)));
}

/** The link line of a day in a weekly entry: the `dailyLink` template with the date, and the link and title of the file if it exists. */
export function dailyLinkLine(template: string, date: Date, locale: string, from?: { weeklyDir: string; file: string; ext: string }): string {
    let line = resolveDate(template, date, locale);
    if (from) {
        const { title, link } = fileLink(from.weeklyDir, from.file, from.ext);
        line = replaceVariable(replaceVariable(line, 'link', link), 'title', title);
    }
    return line;
}

/**
 * The lines of a weekly entry with its top in place: the date line (if given)
 * directly under the title, and the anchor section with the block as the
 * first section under the title (after any lines right under the title, such
 * as memos). A section elsewhere is moved up, a missing one is added; in
 * place, only its block (up to the next heading) is replaced. A date line
 * that a memo pushed down moves back up instead of being added twice.
 */
export function weeklyTop(lines: string[], anchor: string, block: string, dateLine?: string): string[] {
    lines = [...lines];
    block = block.trim();
    const isHeading = (line: string) => /^#+\s/.test(line);
    const sectionEnd = (from: number) => {
        for (let i = from + 1; i < lines.length; i++) {
            if (isHeading(lines[i])) { return i; }
        }
        return lines.length;
    };
    const sectionLines = [anchor, '', ...(block.length > 0 ? block.split(/\r?\n/) : []), ''];

    const title = lines.findIndex(l => /^#\s/.test(l));
    if (dateLine && title !== -1) {
        const preambleEnd = lines.findIndex((l, i) => i > title && isHeading(l));
        const existing = lines.findIndex((l, i) => i > title && (preambleEnd === -1 || i < preambleEnd) && WEEK_DATE_LINE.test(l));
        if (existing !== -1) { lines.splice(existing, 1); }
        lines.splice(title + 1, 0, dateLine);
    }

    const anchorLine = lines.findIndex(l => l.trimEnd() === anchor);
    const firstSection = lines.findIndex((l, i) => i > title && isHeading(l));
    if (anchorLine !== -1 && anchorLine === firstSection) {
        const blockEnd = sectionEnd(anchorLine);
        const existing = lines.slice(anchorLine + 1, blockEnd).map(l => l.trimEnd()).join('\n').trim();
        if (existing === block) { return lines; }
        const tail = blockEnd < lines.length ? lines.slice(blockEnd) : [''];
        return [...lines.slice(0, anchorLine), ...sectionLines, ...tail];
    }

    if (anchorLine !== -1) { lines.splice(anchorLine, sectionEnd(anchorLine) - anchorLine); }
    const restTitle = lines.findIndex(l => /^#\s/.test(l));
    let insertAt = lines.findIndex((l, i) => i > restTitle && isHeading(l));
    if (insertAt === -1) { insertAt = lines.length; }
    const before = lines.slice(0, insertAt);
    while (before.length > 0 && before[before.length - 1].trim() === '') { before.pop(); }
    const after = lines.slice(insertAt);
    return [...(before.length > 0 ? [...before, ''] : []), ...sectionLines, ...(after.length > 0 ? after : [''])];
}
