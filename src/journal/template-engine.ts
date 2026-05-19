// Copyright (C) 2024 Patrick Maué
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

interface TemplateVariableEntry {
    momentFormat: string;
    resolve(m: moment.Moment): string;
}

const TEMPLATE_VARIABLE_MAP: Record<string, TemplateVariableEntry> = {
    year:      { momentFormat: 'YYYY', resolve: m => m.format('YYYY') },
    month:     { momentFormat: 'MM',   resolve: m => m.format('MM') },
    day:       { momentFormat: 'DD',   resolve: m => m.format('DD') },
    localTime: { momentFormat: 'LT',   resolve: m => m.format('LT') },
    localDate: { momentFormat: 'LL',   resolve: m => m.format('LL') },
    weekday:   { momentFormat: 'dddd', resolve: m => m.format('dddd') },
    week:      { momentFormat: 'w',    resolve: m => String(m.week()) },
};

// https://regex101.com/r/i5MUpx/1/ (extended from util/dates.ts)
const TEMPLATE_VAR_REGEX = /\$\{(?:(year|month|day|localTime|localDate|weekday|week)|(d:[\s\S]+?))\}/g;

export function resolveDate(template: string, date: Date, locale?: string): string {
    const mom = locale ? moment(date).locale(locale) : moment(date);
    return template.replace(TEMPLATE_VAR_REGEX, (match, named: string | undefined, custom: string | undefined) => {
        if (named && TEMPLATE_VARIABLE_MAP[named]) {
            return TEMPLATE_VARIABLE_MAP[named].resolve(mom);
        }
        if (custom) {
            return mom.format(custom.slice(2).trim()); // strip 'd:' prefix
        }
        return match;
    });
}

export function toMomentFormat(template: string): string {
    return template.replace(TEMPLATE_VAR_REGEX, (_match, named: string | undefined, custom: string | undefined) => {
        if (named && TEMPLATE_VARIABLE_MAP[named]) {
            return TEMPLATE_VARIABLE_MAP[named].momentFormat;
        }
        if (custom) {
            return custom.slice(2).trim(); // strip 'd:' prefix
        }
        return _match;
    });
}
