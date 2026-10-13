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
 * Template variables, resolved with moment.js in the journal locale. One
 * implementation for the extension and the MCP server (#250).
 */
import moment from 'moment';

const DATE_VARIABLES: Record<string, { format: string }> = {
    year: { format: 'YYYY' },
    month: { format: 'MM' },
    day: { format: 'DD' },
    localTime: { format: 'LT' },
    localDate: { format: 'LL' },
    weekday: { format: 'dddd' },
    week: { format: 'w' },
};

// ${year} … ${week} or ${d:<moment format>}
const DATE_VARIABLE = /\$\{(?:(year|month|day|localTime|localDate|weekday|week)|(d:[\s\S]+?))\}/g;
// ${d+1:dddd}: a moment format for a day after the given one (#137)
const DAY_OFFSET = /\$\{d\+(\d+):([\s\S]+?)\}/g;
const ANY_VARIABLE = /\$\{[^}]+\}/g;

/** Resolves the date variables of a template for the given day. */
export function resolveDate(template: string, date: Date, locale?: string): string {
    const day = locale ? moment(date).locale(locale) : moment(date);
    return template.replace(DATE_VARIABLE, (match, named: string | undefined, custom: string | undefined) => {
        if (named) { return named === 'week' ? String(day.week()) : day.format(DATE_VARIABLES[named].format); }
        if (custom) { return day.format(custom.slice(2).trim()); }
        return match;
    });
}

/** Resolves `${d+N:format}`: the day N days after `date`, in the given moment format. */
export function resolveDayOffsets(template: string, date: Date, locale: string): string {
    return template.replace(DAY_OFFSET, (_match, days: string, format: string) =>
        moment(date).locale(locale).add(parseInt(days), 'days').format(format.trim()));
}

/** The moment format a template's date variables stand for (to parse dates back from paths). */
export function toMomentFormat(template: string): string {
    return template.replace(DATE_VARIABLE, (_match, named: string | undefined, custom: string | undefined) => {
        if (named) { return DATE_VARIABLES[named].format; }
        if (custom) { return custom.slice(2).trim(); }
        return _match;
    });
}

/** Replaces every `${name}` with the value. */
export function replaceVariable(template: string, name: string, value: string): string {
    return template.split(`\${${name}}`).join(value);
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Regex that recognises lines produced by a template: `${input}` becomes the
 * capture group, every other variable a lazy wildcard.
 */
export function templatePattern(template: string): RegExp {
    const firstLine = template.split('\n')[0];
    let source = '';
    let last = 0;
    for (const m of firstLine.matchAll(ANY_VARIABLE)) {
        source += escapeRegExp(firstLine.slice(last, m.index));
        source += m[0] === '${input}' ? '(.*)' : '.*?';
        last = m.index! + m[0].length;
    }
    source += escapeRegExp(firstLine.slice(last));
    return new RegExp(`^\\s*${source}\\s*$`);
}
