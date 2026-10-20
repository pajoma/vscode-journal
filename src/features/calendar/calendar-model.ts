// Copyright (C) 2026  Patrick Maué
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
'use strict';

import moment = require('moment');
import { dayWikiTarget, firstDayOfWeek, weekOf, weekWikiTarget } from 'journal-core';

/** What the calendar shows of a daily entry (#311). */
export interface DaySummary {
    /** Open tasks and all tasks (moved ones not counted), linked notes. */
    open: number;
    tasks: number;
    notes: number;
}

export interface CalendarDay {
    /** `2026-10-20`, as a wiki link names the day. */
    key: string;
    day: number;
    /** False for the days of the first and last week that belong to the month before or after. */
    inMonth: boolean;
    today: boolean;
    /** Set if the day has an entry. */
    entry?: DaySummary;
}

export interface CalendarWeek {
    week: number;
    /** The year the week belongs to (around New Year not the calendar year). */
    year: number;
    /** `2026-w43`. */
    key: string;
    /** Whether the weekly entry exists. */
    exists: boolean;
    days: CalendarDay[];
}

export interface CalendarMonth {
    year: number;
    /** 1–12. */
    month: number;
    /** "October 2026" in the journal locale. */
    title: string;
    /** The short names of the weekdays, from the locale's first day of the week. */
    weekdays: string[];
    weeks: CalendarWeek[];
}

/**
 * The weeks of a month in the journal locale (first day of the week, week
 * numbers, week-year), from the week of its first day to the week of its last.
 */
export function monthWeeks(year: number, month: number, locale: string): { week: number; year: number; days: Date[] }[] {
    const first = new Date(year, month - 1, 1);
    const last = new Date(year, month, 0);
    const weeks: { week: number; year: number; days: Date[] }[] = [];
    let start = moment(firstDayOfWeek(weekOf(first, locale).week, weekOf(first, locale).year, locale));
    while (start.toDate() <= last) {
        const { week, year: weekYear } = weekOf(start.toDate(), locale);
        weeks.push({ week, year: weekYear, days: Array.from({ length: 7 }, (_, i) => start.clone().add(i, 'days').toDate()) });
        start = start.clone().add(7, 'days');
    }
    return weeks;
}

/** A month of the calendar: its weeks and days, which have entries, and today. */
export function calendarMonth(year: number, month: number, locale: string, today: Date, days: Map<string, DaySummary>, weeks: Set<string>): CalendarMonth {
    const todayKey = dayWikiTarget(today);
    const rows = monthWeeks(year, month, locale).map(row => ({
        week: row.week,
        year: row.year,
        key: weekWikiTarget(row.week, row.year),
        exists: weeks.has(weekWikiTarget(row.week, row.year)),
        days: row.days.map(date => {
            const key = dayWikiTarget(date);
            const day: CalendarDay = { key, day: date.getDate(), inMonth: date.getMonth() === month - 1, today: key === todayKey };
            const entry = days.get(key);
            if (entry) { day.entry = entry; }
            return day;
        }),
    }));
    return {
        year,
        month,
        title: moment(new Date(year, month - 1, 1)).locale(locale).format('MMMM YYYY'),
        weekdays: rows[0].days.map((_, i) => moment(new Date(year, month - 1, 1)).locale(locale).startOf('week').add(i, 'days').format('dd')),
        weeks: rows,
    };
}

/** The month before or after. */
export function addMonths(year: number, month: number, count: number): { year: number; month: number } {
    const date = new Date(year, month - 1 + count, 1);
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

/** The months a week touches: the month of its first day, and the month of its last if that differs. */
export function monthsOfWeek(week: number, year: number, locale: string): { year: number; month: number }[] {
    const first = firstDayOfWeek(week, year, locale);
    const last = moment(first).add(6, 'days').toDate();
    const months = [{ year: first.getFullYear(), month: first.getMonth() + 1 }];
    if (last.getMonth() !== first.getMonth()) { months.push({ year: last.getFullYear(), month: last.getMonth() + 1 }); }
    return months;
}
