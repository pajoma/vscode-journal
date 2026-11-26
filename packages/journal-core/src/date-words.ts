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

/**
 * The weekday and month words of the smart input. A word is recognized and
 * resolved to its number from the same list, so the two cannot drift apart
 * (#269). Entries are regex sources, matched case-insensitively as whole
 * words; English is understood in every locale.
 */
interface Words {
    /** Monday to Sunday, each with its spellings. */
    weekdays: string[][];
    /** January to December; empty where the locale uses the English word. */
    months: string[][];
}

const WORDS: Record<string, Words> = {
    en: {
        weekdays: [['monday', 'mon'], ['tuesday', 'tue'], ['wednesday', 'wed'], ['thursday', 'thu'], ['friday', 'fri'], ['saturday', 'sat'], ['sunday', 'sun']],
        months: [['Jan(?:uary)?'], ['Feb(?:ruary)?'], ['Mar(?:ch)?'], ['Apr(?:il)?'], ['May'], ['June?'], ['July?'], ['Aug(?:ust)?'], ['Sep(?:tember)?'], ['Oct(?:ober)?'], ['Nov(?:ember)?'], ['Dec(?:ember)?']],
    },
    de: {
        weekdays: [['montag', 'mon'], ['dienstag', 'die'], ['mittwoch', 'mit'], ['donnerstag', 'don'], ['freitag', 'fre'], ['samstag', 'sam'], ['sonntag', 'son']],
        months: [['Januar'], ['Februar'], ['März'], ['April'], ['Mai'], ['Juni'], ['Juli'], [], [], ['Okt(?:ober)?'], [], ['Dez(?:ember)?']],
    },
    fr: {
        weekdays: [['lundi', 'lun'], ['mardi', 'mar'], ['mercredi', 'mer'], ['jeudi', 'jeu'], ['vendredi', 'ven'], ['samedi', 'sam'], ['dimanche', 'dim']],
        months: [['Janv(?:ier)?'], ['Fév(?:rier)?'], ['Mars'], ['Avr(?:il)?'], [], ['Juin'], ['Juil(?:let)?'], ['Août'], ['Sept(?:embre)?'], ['Oct(?:obre)?'], ['Nov(?:embre)?'], ['Déc(?:embre)?']],
    },
    es: {
        weekdays: [['lunes', 'lun'], ['martes', 'mar'], ['miércoles', 'mié'], ['jueves', 'jue'], ['viernes', 'vie'], ['sábado', 'sáb'], ['domingo', 'dom']],
        months: [['Ene(?:ro)?'], ['Feb(?:rero)?'], ['Mar(?:zo)?'], ['Abr(?:il)?'], ['May(?:o)?'], ['Jun(?:io)?'], ['Jul(?:io)?'], ['Ago(?:sto)?'], ['Sep(?:tiembre)?'], ['Oct(?:ubre)?'], ['Nov(?:iembre)?'], ['Dic(?:iembre)?']],
    },
    it: {
        weekdays: [['lunedì', 'lun'], ['martedì', 'mar'], ['mercoledì', 'mer'], ['giovedì', 'gio'], ['venerdì', 'ven'], ['sabato', 'sab'], ['domenica', 'dom']],
        months: [['Gen(?:naio)?'], ['Feb(?:braio)?'], [], [], ['Mag(?:gio)?'], ['Giu(?:gno)?'], ['Lug(?:lio)?'], [], ['Set(?:tembre)?'], ['Ott(?:obre)?'], [], ['Dic(?:embre)?']],
    },
    pt: {
        weekdays: [['segunda-feira', 'seg'], ['terça-feira', 'ter'], ['quarta-feira', 'qua'], ['quinta-feira', 'qui'], ['sexta-feira', 'sex'], ['sábado', 'sáb'], ['domingo', 'dom']],
        months: [['Jan(?:eiro)?'], ['Fev(?:ereiro)?'], ['Mar(?:ço)?'], [], ['Mai(?:o)?'], ['Jun(?:ho)?'], ['Jul(?:ho)?'], [], ['Set(?:embro)?'], ['Out(?:ubro)?'], ['Nov(?:embro)?'], ['Dez(?:embro)?']],
    },
    nl: {
        weekdays: [['maandag', 'maa'], ['dinsdag', 'din'], ['woensdag', 'woe'], ['donderdag', 'don'], ['vrijdag', 'vri'], ['zaterdag', 'zat'], ['zondag', 'zon']],
        months: [['Jan(?:uari)?'], ['Feb(?:ruari)?'], ['Mrt'], [], ['Mei'], ['Jun(?:i)?'], ['Jul(?:i)?'], ['Aug(?:ustus)?'], [], [], [], []],
    },
    ru: {
        weekdays: [['понедельник', 'пон'], ['вторник', 'вто'], ['среда', 'сре'], ['четверг', 'чет'], ['пятница', 'пят'], ['суббота', 'суб'], ['воскресенье', 'вос']],
        months: [['Янв(?:арь)?'], ['Фев(?:раль)?'], ['Мар(?:т)?'], ['Апр(?:ель)?'], ['Май'], ['Июн(?:ь)?'], ['Июл(?:ь)?'], ['Авг(?:уст)?'], ['Сен(?:тябрь)?'], ['Окт(?:ябрь)?'], ['Ноя(?:брь)?'], ['Дек(?:абрь)?']],
    },
    zh: {
        weekdays: [['xīngqī yī'], ['xīngqī èr'], ['xīngqī sān'], ['xīngqī sì'], ['xīngqī wǔ'], ['xīngqī liù'], ['xīngqī rì']],
        months: [['yīyuè'], ['èryuè'], ['sānyuè'], ['sìyuè'], ['wǔyuè'], ['liùyuè'], ['qīyuè'], ['bāyuè'], ['jiǔyuè'], ['shíyuè'], ['shíyīyuè'], ["shí'èryuè"]],
    },
    ja: {
        weekdays: [['getsuyōbi'], ['kayōbi'], ['suiyōbi'], ['mokuyōbi'], ["kin'yōbi"], ['doyōbi'], ['nichiyōbi']],
        months: [['ichigatsu'], ['nigatsu'], ['sangatsu'], ['shigatsu'], ['gogatsu'], ['rokugatsu'], ['shichigatsu'], ['hachigatsu'], ['kugatsu'], ['jugatsu'], ['juichigatsu'], ['juunigatsu']],
    },
    ar: {
        weekdays: [['الإثنين'], ['الثلاثاء'], ['الأربعاء'], ['الخميس'], ['الجمعة'], ['السبت'], ['الأحد']],
        months: [['يناير'], ['فبراير'], ['مارس'], ['أبريل'], ['مايو'], ['يونيو'], ['يوليو'], ['أغسطس'], ['سبتمبر'], ['أكتوبر'], ['نوفمبر'], ['ديسمبر']],
    },
};

/** A word found at the start of the text and the number it stands for. */
export interface WordMatch {
    text: string;
    value: number;
}

interface Pattern { re: RegExp; value: number; }

const cache = new Map<string, { weekdays: Pattern[]; months: Pattern[] }>();

function patterns(locale: string): { weekdays: Pattern[]; months: Pattern[] } {
    const language = locale.toLowerCase().split(/[-_]/)[0];
    let compiled = cache.get(language);
    if (!compiled) {
        const lists = [WORDS.en, ...(language !== 'en' && WORDS[language] ? [WORDS[language]] : [])];
        const compile = (slots: (words: Words) => string[][], first: number): Pattern[] => lists.flatMap(words =>
            slots(words).flatMap((spellings, i) => spellings.map(s => ({ re: new RegExp(`^(?:${s})(?=\\s|$)`, 'i'), value: first + i }))));
        compiled = { weekdays: compile(w => w.weekdays, 1), months: compile(w => w.months, 0) };
        cache.set(language, compiled);
    }
    return compiled;
}

function match(text: string, candidates: Pattern[]): WordMatch | undefined {
    for (const { re, value } of candidates) {
        const m = text.match(re);
        if (m) { return { text: m[0], value }; }
    }
    return undefined;
}

/** The weekday word at the start of the text, as ISO day (1 = Monday … 7 = Sunday). */
export function matchWeekday(text: string, locale: string): WordMatch | undefined {
    return match(text, patterns(locale).weekdays);
}

/** The month word at the start of the text, as month index (0 = January). */
export function matchMonth(text: string, locale: string): WordMatch | undefined {
    return match(text, patterns(locale).months);
}

/** Words for a day relative to today, with their day offset. */
export const SHORTCUTS: Readonly<Record<string, number>> = {
    today: 0, tod: 0, heute: 0, '0': 0,
    tomorrow: 1, tom: 1, morgen: 1,
    yesterday: -1, yes: -1, gestern: -1,
};
