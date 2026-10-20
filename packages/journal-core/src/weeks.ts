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
 * Weeks as the journal counts them: moment's locale-aware week in the journal
 * locale (week start and first week depend on it), with the year the week
 * belongs to, which differs from the calendar year around New Year.
 */
import moment from 'moment';

export interface Week {
    week: number;
    /** The year the week belongs to, e.g. 2026 for 2027-01-03 in German (week 53). */
    year: number;
}

/** The week of the given day. */
export function weekOf(date: Date, locale: string): Week {
    const day = moment(date).locale(locale);
    return { week: day.week(), year: day.weekYear() };
}

/**
 * The first day of a week (Monday or Sunday, depending on the locale).
 * Independent of today: July 1 always lies in week-year `year`, whereas
 * starting from today let week 53 overflow in a year with 52 weeks (#137).
 */
export function firstDayOfWeek(week: number, year: number, locale: string): Date {
    return moment({ year, month: 6, day: 1 }).locale(locale).week(week).startOf('week').toDate();
}

/** The seven days of a week, from its first day. */
export function daysOfWeek(week: number, year: number, locale: string): Date[] {
    const first = moment(firstDayOfWeek(week, year, locale));
    return Array.from({ length: 7 }, (_, i) => first.clone().add(i, 'days').toDate());
}
