// Copyright (C) 2021 Patrick Maué
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

import moment = require("moment");


/**
 * The week number of the given date in the journal locale (`journal.locale`):
 * moment's locale-aware week, as for the `${week}` template variable and the
 * MCP server. Not the global moment locale, which other code changes (#250).
 */
export function getCurrentISOWeek(date: Date, locale: string): number {
    return moment(date).locale(locale).week();
}

/**
 * The year the week of the given date belongs to, in the journal locale. For
 * dates in the first or last week of the year, this may differ from the
 * calendar year (e.g. 2027-01-03 belongs to week 53 of 2026 in German).
 */
export function getISOWeekYear(date: Date, locale: string): number {
    return moment(date).locale(locale).weekYear();
}

/**
 * Returns the 7 Date objects of the given week/year pair, starting with the
 * first day of the week in the journal locale (as getCurrentISOWeek and getISOWeekYear).
 */
export function getDatesOfISOWeek(week: number, year: number, locale: string): Date[] {
    const startOfWeek = moment().locale(locale).week(week).weekYear(year).startOf("week");
    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
        dates.push(moment(startOfWeek).add(i, "days").toDate());
    }
    return dates;
}

/**
* Formats a given Date in long format (for Header in journal pages)
*/
export function formatDate(date: Date, template: string, locale: string): string {
    moment.locale(locale);
    let now = moment(date).format(template);
    /*

    let dateFormatOptions: Intl.DateTimeFormatOptions = {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    };
    return date.toLocaleDateString(locale, dateFormatOptions);
    */
    return now;
}
