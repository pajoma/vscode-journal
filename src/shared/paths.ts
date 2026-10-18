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

import * as Path from 'path';
import { fileURLToPath } from 'url';
import { JournalPageType } from './model/index';
import { JournalPaths, JournalScopes, JournalSettings, toMomentFormat } from 'journal-core';
import moment = require('moment');

/**
 * Tries to infer a date from a given path (taken from vscode.TextDocument)
 * 
 * This function expects only paths to valid journal entries, scoped entries are ignored
 * 
 * @param entryPath 
 */
export async function getDateFromPathPattern(entryPath: string, pathTemplate: string, fileTemplate: string, basePath: string): Promise<Date> {
    if (fileTemplate.indexOf(".") > 0) { fileTemplate = fileTemplate.substring(0, fileTemplate.lastIndexOf(".")); }
    if (pathTemplate.startsWith("${base}/")) { pathTemplate = pathTemplate.substring("${base}/".length); }

    // Normalize paths to use forward slashes and ensure absolute path for URI
    const normalizedUri = entryPath.replace(/\\/g, '/');
    const normalizedBase = basePath.replace(/\\/g, '/');

    // Strip the base path prefix from the URI
    let relativePath = normalizedUri;
    if (normalizedUri.startsWith(normalizedBase)) {
        relativePath = normalizedUri.substring(normalizedBase.length).replace(/^\/+/, '');
    } else if (normalizedUri.includes('://')) {
        // Handle URI schemes (file:///...)
        try {
            const url = new URL(normalizedUri);
            const fsPath = (url.protocol === 'file:' ? fileURLToPath(url) : decodeURIComponent(url.pathname)).replace(/\\/g, '/');
            if (fsPath.startsWith(normalizedBase)) {
                relativePath = fsPath.substring(normalizedBase.length).replace(/^\/+/, '');
            }
        } catch { /* fallback to path split */ }
    }

    const pathParts = relativePath.split('/');
    const trimmedFileString = pathParts.length > 0 ? pathParts[pathParts.length - 1].split('.')[0] : "";
    const trimmedPathString = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : "";

    const entryDateFormat = toMomentFormat(fileTemplate);
    const pathDateFormat = toMomentFormat(pathTemplate);

    let parsedDateFromFile = moment(trimmedFileString, entryDateFormat);
    let parsedDateFromPath = moment(trimmedPathString, pathDateFormat);

    let result = moment().startOf('day');

    // consolidate the two
    if (fileTemplate.indexOf("${year}") >= 0) { result = result.year(parsedDateFromFile.year()); }
    else { result = result.year(parsedDateFromPath.year()); }
    if (fileTemplate.indexOf("${month}") >= 0) { result = result.month(parsedDateFromFile.month()); }
    else { result = result.month(parsedDateFromPath.month()); }
    if (fileTemplate.indexOf("${day}") >= 0) {
        // Parse day directly as integer to avoid moment overflow when the current
        // month has fewer days than the target day (e.g. parsing "31" in June gives July 1).
        const dayInt = /^\d+$/.test(trimmedFileString) ? parseInt(trimmedFileString, 10) : parsedDateFromFile.date();
        result = result.date(dayInt);
    } else { result = result.date(parsedDateFromPath.date()); }

    return result.toDate();

}

/**
 * Tries to infer a date from a given path (taken from vscode.TextDocument)
 * 
 * This function expects only paths to valid journal entries, scoped entries are ignored
 * 
 * @param entryPath 
 */
export async function getDateFromPath(entryPath: string, configCtrl: JournalSettings & JournalScopes & JournalPaths): Promise<Date> {
    const pathTpl = configCtrl.getResolvedEntryPath(new Date()).template;
    const entryTpl = configCtrl.getEntryFilePattern(new Date()).template;
    const base = configCtrl.getBasePath();

    return getDateFromPathPattern(entryPath, pathTpl, entryTpl, base);

}


/** Context passed to inferType. All future fields must be optional (?:) to prevent shotgun surgery. */
export interface InferTypeContext {
    extension: string;
}

export function inferType(entry: Path.ParsedPath, ctx: InferTypeContext): JournalPageType {

    if (!entry.ext.endsWith(ctx.extension)) {
        return JournalPageType.attachment;
    } else if (entry.name.match(/^[\d\-_]+$/)) {
        return JournalPageType.entry;
    } else {
        return JournalPageType.note;
    }


}


/**
 * Converts given path and filename into a full path.
 * @param pathname
 * @param filename
 */
export function resolvePath(pathname: string, filename: string): string {

    return Path.join(pathname, filename);

}

/**
 * Tries to infer the week number, year, and scope from the file path of a weekly entry by matching
 * the path against the configured weeks path+file patterns for each known scope.
 *
 * Pattern variables: ${base}, ${ext}, ${year} → 4 digits, ${week} → 1–2 digits. A variable that
 * occurs twice (e.g. `${base}/${year}/${year}-w${week}.${ext}`) must have the same value both
 * times. Other variables match any text within one path segment.
 * Returns undefined when no configured scope matches the path.
 */
export function getWeekFromPath(
    fsPath: string,
    config: JournalSettings & JournalScopes & JournalPaths
): { week: number; year: number; scope: string } | undefined {
    const uriPath = fsPath.replace(/\\/g, '/');

    for (const scope of config.getScopes()) {
        const scopeId = scope === 'default' ? undefined : scope;
        const template = config.getWeeksPathPatternRaw(scopeId) + '/' + config.getWeeksFilePatternRaw(scopeId);
        const regex = weekPathRegex(template, config.getBasePath(scopeId), config.getFileExtension());
        const match = regex.exec(uriPath);
        if (match?.groups) {
            return { week: parseInt(match.groups.week, 10), year: parseInt(match.groups.year, 10), scope };
        }
    }

    return undefined;
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The regex of a weekly path template: literal text escaped, repeated variables as backreferences. */
function weekPathRegex(template: string, base: string, ext: string): RegExp {
    const groups: Record<string, string> = { year: '\\d{4}', week: '\\d{1,2}' };
    const seen = new Set<string>();
    const source = template.split(/(\$\{[^}]+\})/).map((part, i) => {
        if (i % 2 === 0) { return escapeRegex(part.replace(/\\/g, '/')); }
        const name = part.slice(2, -1);
        if (name === 'base') { return escapeRegex(base.replace(/\\/g, '/')); }
        if (name === 'ext') { return escapeRegex(ext); }
        if (!(name in groups)) { return '[^/]*?'; }
        if (seen.has(name)) { return `\\k<${name}>`; }
        seen.add(name);
        return `(?<${name}>${groups[name]})`;
    }).join('');
    // without week or year the path is not a weekly entry
    return seen.size === 2 ? new RegExp(source + '$') : /(?!)/;
}
