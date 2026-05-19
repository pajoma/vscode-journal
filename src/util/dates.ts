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
 * Returns the ISO week number for the given date using the same backing
 * library (moment.js) as the rest of the codebase, so values stay
 * consistent with the `${week}` template variable and weekly path resolution.
 */
export function getCurrentISOWeek(date: Date): number {
    return moment(date).week();
}

/**
 * Returns the year associated with the ISO week of the given date. For
 * dates in the first or last week of the year, this may differ from the
 * calendar year (e.g. 2024-12-30 belongs to ISO week 1 of 2025).
 */
export function getISOWeekYear(date: Date): number {
    return moment(date).weekYear();
}

/**
 * Returns the 7 Date objects (Mon → Sun) for the given week/year pair, using
 * the same locale-aware week convention as getCurrentISOWeek and getISOWeekYear.
 */
export function getDatesOfISOWeek(week: number, year: number): Date[] {
    const startOfWeek = moment().week(week).weekYear(year).startOf("week");
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




/**
 * Return day of week for given string. 
 * 
 * Update: Using momentjs to support locales (since first day of week differs internationally)
 */
 export function getDayOfWeekForString(day: string, locale: string): number {
    // Support for English, German, French, Spanish, Italian, Portuguese, Dutch, Russian, Chinese (Pinyin), Japanese (Romaji), and Arabic
    if (day.match(/monday|mon|mo|montag|lun|lundi|lunes|lunedì|segunda-feira|seg|maandag|ma|понедельник|пн|xīngqī yī|getsuyōbi|الإثنين/i)) { return 1; }
    if (day.match(/tuesday|tue|tu|dienstag|die|mar|mardi|martes|martedì|terça-feira|ter|dinsdag|di|вторник|вт|xīngqī èr|kayōbi|الثلاثاء/i)) { return 2; }
    if (day.match(/wednesday|wed|we|mittwoch|mit|mer|mercredi|miércoles|mié|mercoledì|quarta-feira|qua|woensdag|woe|среда|ср|xīngqī sān|suiyōbi|الأربعاء/i)) { return 3; }
    if (day.match(/thursday|thu|th|donnerstag|don|jeu|jeudi|jue|jueves|giovedì|quinta-feira|qui|donderdag|do|четверг|чт|xīngqī sì|mokuyōbi|الخميس/i)) { return 4; }
    if (day.match(/friday|fri|fr|freitag|fre|ven|vendredi|vie|viernes|venerdì|sexta-feira|sex|vrijdag|vr|пятница|пт|xīngqī wǔ|kin'yōbi|الجمعة/i)) { return 5; }
    if (day.match(/saturday|sat|sa|samstag|sam|samedi|sáb|sábado|sabato|sábado|zaterdag|za|суббота|сб|xīngqī liù|doyōbi|السبت/i)) { return 6; }
    if (day.match(/sunday|sun|su|sonntag|dim|dimanche|dom|domingo|domenica|domingo|zondag|zo|воскресенье|вс|xīngqī rì|nichiyōbi|الأحد/i)) { return 7; }
    return -1;
    
}

/**
 * Return day of week for given string. 
 * 
 * Update: Using momentjs to support locales (since first day of week differs internationally)
 */
 export function getMonthForString(month: string): number {
    // Support for English, German, French, Spanish, Italian, Portuguese, Dutch, Russian, Chinese (Pinyin), Japanese (Romaji), and Arabic months
    if (month.match(/jan|january|januar|janvier|enero|gennaio|janeiro|januari|янв|январь|yīyuè|ichigatsu|يناير/i)) { return 0; }
    if (month.match(/feb|february|februar|février|febrero|febbraio|fevereiro|februari|фев|февраль|èryuè|nigatsu|فبراير/i)) { return 1; }
    if (month.match(/mar|march|märz|mars|marzo|maart|март|sānyuè|sangatsu|مارس/i)) { return 2; }
    if (month.match(/apr|april|avril|abril|aprile|april|апр|апрель|sìyuè|shigatsu|أبريل/i)) { return 3; }
    if (month.match(/may|mai|mayo|maggio|mei|май|wǔyuè|gogatsu|مايو/i)) { return 4; }
    if (month.match(/jun|june|juin|junio|giugno|junho|juni|июнь|liùyuè|rokugatsu|يونيو/i)) { return 5; }
    if (month.match(/jul|july|juli|juillet|julio|luglio|julho|июль|qīyuè|shichigatsu|يوليو/i)) { return 6; }
    if (month.match(/aug|august|août|agosto|agosto|augustus|авг|август|bāyuè|hachigatsu|أغسطس/i)) { return 7; }
    if (month.match(/sep|sept|september|septembre|septiembre|settembre|setembro|september|сент|сентябрь|jiǔyuè|kugatsu|سبتمبر/i)) { return 8; }
    if (month.match(/oct|october|oktober|octobre|octubre|ottobre|outubro|oktober|окт|октябрь|shíyuè|jugatsu|أكتوبر/i)) { return 9; }
    if (month.match(/nov|november|novembre|noviembre|novembro|ноя|ноябрь|shíyīyuè|juichigatsu|نوفمبر/i)) { return 10; }
    if (month.match(/dec|december|dezember|décembre|diciembre|dicembre|dezembro|декабрь|shí'èryuè|juunigatsu|ديسمبر/i)) { return 11; }

    return -1;
}


