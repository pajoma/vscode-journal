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

/**
 * What a date expression of the smart input means: a day relative to today
 * ("tomorrow", "+2", "next friday", "10-24", "oct 24") or a week ("next week",
 * "w23"). The tokens come from date-tokens.ts; the extension's smart input and
 * the MCP server's date arguments resolve them here, so both understand the
 * same words.
 */
import { SHORTCUTS } from './date-words';
import { Token, tokenize } from './date-tokens';
import { firstDayOfWeek, weekOf } from './weeks';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/** A day as offset from today, or a week of a week-year (journal locale). */
export type DateTarget = { offset: number } | { week: number; year: number };

/**
 * The date the temporal tokens name, relative to `today`; undefined if there is
 * none. Week numbers follow the journal locale.
 *
 * @throws if a date is out of range ("13-01")
 */
export function resolveTemporal(tokens: Token[], today: Date, locale: string): DateTarget | undefined {
    const find = <T extends Token['type']>(type: T) => tokens.find((t): t is Extract<Token, { type: T }> => t.type === type);

    const shortcut = find('shortcut');
    const offset = find('offset');
    const iso = find('iso');
    const modifier = find('modifier')?.value;
    const weekday = find('weekday');
    const week = find('week');
    const weekNum = find('weekNum');
    const month = find('month');
    const dayOfMonth = find('dayOfMonth');

    if (shortcut) { return { offset: SHORTCUTS[shortcut.value] }; }
    if (offset) { return { offset: parseInt(offset.value) }; }
    if (iso) { return { offset: isoOffset(iso.value, today) }; }
    if (weekday) { return { offset: weekdayOffset(weekday.isoDay, modifier, today) }; }
    if (weekNum) {
        // "w23" is week 23 of the current week-year
        return { week: parseInt(weekNum.value), year: weekOf(today, locale).year };
    }
    if (week) {
        const related = weekOf(relatedWeekDay(modifier, today), locale);
        return { week: related.week, year: related.year };
    }
    if (month && dayOfMonth) {
        return { offset: daysFrom(today, today.getFullYear(), month.month, parseInt(dayOfMonth.value)) };
    }
    return undefined;
}

/**
 * The day a date expression names, relative to `today` (local date); a week
 * expression names the first day of that week. Undefined if the value is not
 * only a date expression ("next friday" is one, "next friday call" is not).
 *
 * @throws if a date is out of range ("13-01")
 */
export function dayOfExpression(value: string, today: Date, locale: string): Date | undefined {
    const { tokens } = tokenize(value, locale, { flags: false });
    if (tokens.some(t => t.type === 'text')) { return undefined; }
    const target = resolveTemporal(tokens, today, locale);
    if (!target) { return undefined; }
    if ('week' in target) { return firstDayOfWeek(target.week, target.year, locale); }
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() + target.offset);
}

/** Days from today to the given date (month 0-based), ignoring the time of day. */
function daysFrom(today: Date, year: number, month: number, day: number): number {
    const todayInMS = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.floor((Date.UTC(year, month, day) - todayInMS) / MS_PER_DAY);
}

/** `2026-10-24`, `10-24` (this year) or `24` (this month); `/` works as separator, too. */
function isoOffset(value: string, today: Date): number {
    const parts = value.split(/[-/]/).map(part => parseInt(part));
    const [year, month, day] = parts.length >= 3 ? parts
        : parts.length === 2 ? [today.getFullYear(), ...parts]
            : [today.getFullYear(), today.getMonth() + 1, parts[0]];

    if (month < 1 || month > 12) { throw new Error("Invalid value for month"); }
    if (day < 1 || day > 31) { throw new Error("Invalid value for day"); }
    return daysFrom(today, year, month - 1, day);
}

/**
 * The weekday of the current week (Monday to Sunday); with "last" or "next"
 * the one before or after today.
 *
 * @param searchedDay the ISO weekday (1 = Monday … 7 = Sunday)
 * @param modifier `last`/`l` or `next`/`n`
 */
function weekdayOffset(searchedDay: number, modifier: string | undefined, today: Date): number {
    // ISO numbering like searchedDay: getDay() counts Sunday as 0
    const diff = searchedDay - (today.getDay() || 7);
    if (modifier === undefined) { return diff; }
    if (modifier.startsWith('n')) { return diff <= 0 ? diff + 7 : diff; }
    return diff < 0 ? diff : diff - 7;
}

/** A day of the current week; with "last" or "next" of the week before or after. */
function relatedWeekDay(modifier: string | undefined, today: Date): Date {
    const shift = modifier?.startsWith('l') ? -1 : modifier?.startsWith('n') ? 1 : 0;
    return new Date(today.getTime() + shift * MS_PER_WEEK);
}
