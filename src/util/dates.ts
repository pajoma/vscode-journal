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


/**
 * Gets the day of the week.
 * 
 * @param input 
 * @param locale 
 * @returns 
 */
export function normalizeDayAsString(input: string, locale?: string): moment.Moment {
    if(input.length === 3) {
        let mom : moment.Moment = moment(); 
        mom.locale("en"); 
    
        if (input.match(/sun/)) { return mom.day(0); }
        if (input.match(/mon/)) { return mom.day(1); }
        if (input.match(/tue/)) { return mom.day(2); }
        if (input.match(/wed/)) { return mom.day(3); }
        if (input.match(/thu/)) { return mom.day(4); }
        if (input.match(/fri/)) { return mom.day(5); }
        if (input.match(/sat/)) { return mom.day(6); }
    }
    
    return moment().day(input); 
}

/**
 * Return day of week for given string. 
 * 
 * Update: Using momentjs to support locales (since first day of week differs internationally)
 */
 export function getDayOfWeekForString(day: string, locale: string): number {
    day = day.toLowerCase();
    moment.locale(locale);

    return moment().day(day).weekday(); 
    /*
    let dayAsString = ""; 
    
    if (day.match(/monday|mon|montag/)) { day }
    if (day.match(/tuesday|tue|dienstag/)) { return 2; }
    if (day.match(/wednesday|wed|mittwoch/)) { return 3; }
    if (day.match(/thursday|thu|donnerstag/)) { return 4; }
    if (day.match(/friday|fri|freitag/)) { return 5; }
    if (day.match(/saturday|sat|samstag/)) { return 6; }
    if (day.match(/sunday|sun|sonntag/)) { return 7; }
    return -1;
    */
}


   /**
     * Checks whether any embedded expressions with date formats are in the template, and replaces them in the value using the given date. 
     * 
     * @param st
     * @param date 
     */
    // https://regex101.com/r/i5MUpx/1/
    // private regExpDateFormats: RegExp = new RegExp(/\$\{(?:(year|month|day|localTime|localDate|weekday)|(d:\w+))\}/g);
    // fix for #52
    // private regExpDateFormats: RegExp = new RegExp(/\$\{(?:(year|month|day|localTime|localDate|weekday)|(d:\w+))\}/g);
    const regExpDateFormats: RegExp = new RegExp(/\$\{(?:(year|month|day|localTime|localDate|weekday)|(d:[\s\S]+?))\}/g);

    export function replaceDateFormats(template: string, date: Date, locale?: string): string {
        let matches: RegExpMatchArray = template.match(regExpDateFormats) || [];
        // if (isNullOrUndefined(st.value)) { return st.template; }

        // console.log(JSON.stringify(matches));

        let mom: moment.Moment = moment(date);
        moment.locale(locale);

        matches.forEach(match => {
            switch (match) {
                case "${year}":
                    template = template.replace(match, mom.format("YYYY")); break;
                case "${month}":
                    template = template.replace(match, mom.format("MM")); break;
                case "${day}":
                    template = template.replace(match, mom.format("DD")); break;
                case "${localTime}":
                    template = template.replace(match, mom.format("LT")); break;
                case "${localDate}":
                    template = template.replace(match, mom.format("LL")); break;
                case "${weekday}":
                    template = template.replace(match, mom.format("dddd")); break;
                default:
                    // check if custom format
                    if (match.startsWith("${d:")) {

                        let modifier = match.substring(match.indexOf("d:") + 2, match.length - 1); // includes } at the end
                        // st.template = st.template.replace(match, mom.format(modifier));
                        // fix for #51
                        template = template.replace(match, mom.format(modifier));
                        break;
                    }
                    break;
            }
        });

        return template;
    }

    export function replaceDateTemplatesWithMomentsFormats(template: string): string {
        let matches: RegExpMatchArray = template.match(regExpDateFormats) || [];
        matches.forEach(match => {
            switch (match) {
                case "${year}":
                    template = template.replace(match, "YYYY"); break;
                case "${month}":
                    template = template.replace(match, "MM"); break;
                case "${day}":
                    template = template.replace(match, "DD"); break;
                case "${localTime}":
                    template = template.replace(match, "LT"); break;
                case "${localDate}":
                    template = template.replace(match, "LL"); break;
                case "${weekday}":
                    template = template.replace(match, "dddd"); break;
                default:
                    // check if custom format
                    if (match.startsWith("${d:")) {

                        let modifier = match.substring(match.indexOf("d:") + 2, match.length - 1); // includes } at the end
                        // st.template = st.template.replace(match, mom.format(modifier));
                        // fix for #51
                        template = template.replace(match, modifier);
                        break;
                    }
                    break;
            }
        });
        return template;

    }