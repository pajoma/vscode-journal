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
 * Which day or week a file of the journal is, from its path and the patterns
 * of every layout (#309); shared by the extension and the MCP server
 * (docs/specs/2026-11-13-scopes-keys-plans.md).
 */

import { JournalPaths, JournalScopes, JournalSettings } from './config/interfaces';
import { Layout, SCOPE_DEFAULT } from './config/types';
import { escapeRegex } from './template';

/**
 * Tries to infer the week number, year, and scope from the file path of a weekly entry by matching
 * the path against the configured weeks path+file patterns for each known scope, and against those of
 * the earlier layouts and the defaults (`journal.patternHistory`, #309): a weekly entry written before
 * the patterns changed is still one. See {@link matchPathTemplate} for the variables.
 * Returns undefined when no configured scope matches the path.
 */
export function getWeekFromPath(
    fsPath: string,
    config: JournalSettings & JournalScopes & JournalPaths,
): { week: number; year: number; scope: string } | undefined {
    for (const scope of config.getScopes()) {
        const scopeId = scope === 'default' ? undefined : scope;
        const templates: [string, string][] = [
            [config.getWeeksPathPatternRaw(scopeId) + '/' + config.getWeeksFilePatternRaw(scopeId), config.getFileExtension()],
            ...config.getLayouts(scopeId).map(layout => [weekTemplate(layout), layout.ext] as [string, string]),
        ];
        for (const [template, ext] of templates) {
            const match = matchPathTemplate(fsPath, template, config.getBasePath(scopeId), ext);
            if (match?.week !== undefined && match.year !== undefined) {
                return { week: match.week, year: match.year, scope };
            }
        }
    }

    return undefined;
}

/**
 * The day of a daily entry of the scope, by the entry patterns of every
 * layout (#309); undefined if the path is no daily entry. Unlike
 * getDateFromPath, it does not guess.
 */
export function getEntryDayFromPath(fsPath: string, config: JournalScopes & JournalPaths & JournalSettings, scopeId?: string): Date | undefined {
    const scope = scopeId === SCOPE_DEFAULT ? undefined : scopeId;
    const base = config.getBasePath(scope);
    for (const layout of config.getLayouts(scope)) {
        const match = matchPathTemplate(fsPath, entryTemplate(layout), base, layout.ext);
        const date = match && validDate(match.year, match.month, match.day);
        if (date) { return date; }
    }
    return undefined;
}

/** The path and file pattern of a layout's daily entries, as one template. */
export function entryTemplate(layout: Layout): string {
    return layout.patterns.entries.path + '/' + layout.patterns.entries.file;
}

/** The path and file pattern of a layout's weekly entries, as one template. */
export function weekTemplate(layout: Layout): string {
    return layout.patterns.weeks.path + '/' + layout.patterns.weeks.file;
}

/** The date if year, month and day form a real day (not 2019-02-31), else undefined. */
export function validDate(year?: number, month?: number, day?: number): Date | undefined {
    if (year === undefined || month === undefined || day === undefined) { return undefined; }
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

export type PathVariable = 'year' | 'month' | 'day' | 'week';

const PATH_VARIABLES: Record<PathVariable, string> = { year: '\\d{4}', month: '\\d{1,2}', day: '\\d{1,2}', week: '\\d{1,2}' };

/**
 * Matches a file path against a path template such as
 * `${base}/${year}/${year}-w${week}.${ext}`: ${base} and ${ext} are the given
 * values, ${year} (4 digits), ${month}, ${day} and ${week} (1–2 digits) are
 * returned. A variable that occurs twice must have the same value both times;
 * other variables (${input}, ${d:…}) match any text within one path segment,
 * literal text matches literally.
 * @returns the numbers of the variables in the template, undefined if the path does not match
 */
export function matchPathTemplate(fsPath: string, template: string, base: string, ext: string): Partial<Record<PathVariable, number>> | undefined {
    const { source, seen } = templateSource(template, base, ext);
    return numbers(new RegExp(source + '$').exec(slashed(fsPath)), seen);
}

/**
 * The text of ${input} in a path that matches the template (e.g. the title
 * part of a note's file name); undefined if the path does not match or the
 * template has no ${input}.
 */
export function matchTemplateInput(fsPath: string, template: string, base: string, ext: string): string | undefined {
    const { source } = templateSource(template, base, ext, true);
    return new RegExp(source + '$').exec(slashed(fsPath))?.groups?.input;
}

/**
 * Matches one file or folder name against one segment of a path template
 * (e.g. `${month}` or `${day}.${ext}`), like {@link matchPathTemplate}.
 * @returns the numbers of the variables in the segment, undefined if the name does not match
 */
export function matchPathSegment(name: string, segment: string, ext: string): Partial<Record<PathVariable, number>> | undefined {
    const { source, seen } = templateSource(segment, '', ext);
    return numbers(new RegExp('^' + source + '$').exec(name), seen);
}

/** The regex source of a path template and the date variables in it. */
function templateSource(template: string, base: string, ext: string, captureInput = false): { source: string; seen: Set<PathVariable> } {
    const seen = new Set<PathVariable>();
    let input = false;
    const source = template.split(/(\$\{[^}]+\})/).map((part, i) => {
        if (i === 0) { return escapeRegex(slashed(part)); }
        if (i % 2 === 0) { return escapeRegex(part.replace(/\\/g, '/')); }
        const name = part.slice(2, -1);
        if (name === 'base') { return escapeRegex(slashed(base)); }
        if (name === 'ext') { return escapeRegex(ext); }
        if (name === 'input' && captureInput) {
            if (input) { return '\\k<input>'; }
            input = true;
            return '(?<input>[^/]+?)';
        }
        if (!(name in PATH_VARIABLES)) { return '[^/]*?'; }
        const variable = name as PathVariable;
        if (seen.has(variable)) { return `\\k<${variable}>`; }
        seen.add(variable);
        return `(?<${variable}>${PATH_VARIABLES[variable]})`;
    }).join('');
    return { source, seen };
}

function numbers(match: RegExpExecArray | null, seen: Set<PathVariable>): Partial<Record<PathVariable, number>> | undefined {
    if (!match) { return undefined; }
    const result: Partial<Record<PathVariable, number>> = {};
    for (const variable of seen) { result[variable] = parseInt(match.groups![variable], 10); }
    return result;
}

/**
 * The path with forward slashes and a lowercase Windows drive letter:
 * `${homeDir}` gives `C:\Users\…`, VS Code's fsPath `c:\Users\…` (#327).
 */
export const slashed = (path: string) => path.replace(/\\/g, '/').replace(/^(\/?)([A-Za-z]):/, (_, slash: string, drive: string) => slash + drive.toLowerCase() + ':');
