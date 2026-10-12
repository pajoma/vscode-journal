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
//

'use strict';

import { getCurrentISOWeek } from '../../shared/dates/dates';
import { EntryGranularity, Input } from '../../shared/model/index';
import { Token } from './tokenizer';
import { SHORTCUTS } from './vocabulary';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/**
 * Turns the tokens of smart input into an Input: the day offset (or week)
 * relative to `today`, the flag and the text. Without a date, the input goes
 * to today, or to the current week when entries are weekly.
 */
export function resolveTokens(tokens: Token[], today: Date, granularity: EntryGranularity): Input {
    const result = new Input();
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

    result.flags = find('flag')?.value ?? '';
    result.text = find('text')?.value.trim() ?? '';

    if (shortcut) {
        result.offset = SHORTCUTS[shortcut.value];
    } else if (offset) {
        result.offset = parseInt(offset.value);
    } else if (iso) {
        result.offset = isoOffset(iso.value, today);
    } else if (weekday) {
        result.offset = weekdayOffset(weekday.isoDay, modifier, today);
    } else if (weekNum) {
        result.week = parseInt(weekNum.value);
        result.offset = NaN;
    } else if (week) {
        result.week = relatedWeek(modifier, today);
        result.offset = NaN;
    } else if (month && dayOfMonth) {
        result.offset = daysFrom(today, today.getFullYear(), month.month, parseInt(dayOfMonth.value));
    } else if (granularity === 'weekly') {
        result.week = getCurrentISOWeek(today);
        result.offset = NaN;
    } else {
        result.offset = 0;
    }

    if (!result.hasFlags() && result.hasMemo()) {
        result.flags = 'memo';
    }
    if (result.hasFlags() && !result.hasMemo()) {
        throw new Error('No text found for memo or task');
    }
    return result;
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

/** The current ISO week; with "last" or "next" the one before or after. */
function relatedWeek(modifier: string | undefined, today: Date): number {
    const shift = modifier?.startsWith('l') ? -1 : modifier?.startsWith('n') ? 1 : 0;
    return getCurrentISOWeek(new Date(today.getTime() + shift * MS_PER_WEEK));
}
