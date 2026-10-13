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
export async function getDateFromURI(uri: string, pathTemplate: string, fileTemplate: string, basePath: string): Promise<Date> {
    if (fileTemplate.indexOf(".") > 0) { fileTemplate = fileTemplate.substring(0, fileTemplate.lastIndexOf(".")); }
    if (pathTemplate.startsWith("${base}/")) { pathTemplate = pathTemplate.substring("${base}/".length); }

    // Normalize paths to use forward slashes and ensure absolute path for URI
    const normalizedUri = uri.replace(/\\/g, '/');
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
export async function getDateFromURIAndConfig(entryPath: string, configCtrl: JournalSettings & JournalScopes & JournalPaths): Promise<Date> {
    const pathTpl = configCtrl.getResolvedEntryPath(new Date()).template;
    const entryTpl = configCtrl.getEntryFilePattern(new Date()).template;
    const base = configCtrl.getBasePath();

    return getDateFromURI(entryPath, pathTpl, entryTpl, base);

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
 * the URI against the configured weeks path+file patterns for each known scope.
 *
 * Pattern variables supported: ${base}, ${year} → (\d{4}), ${week} → (\d{1,2}), ${ext}.
 * Returns undefined when no configured scope matches the URI.
 */
export async function getWeekFromURIAndConfig(
    fsPath: string,
    config: JournalSettings & JournalScopes & JournalPaths
): Promise<{ week: number; year: number; scope: string } | undefined> {
    const ext = config.getFileExtension();
    const escapedExt = ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const uriPath = fsPath.replace(/\\/g, '/');

    for (const scope of config.getScopes()) {
        const scopeId = scope === 'default' ? undefined : scope;
        const base = config.getBasePath(scopeId);
        const pathTpl = config.getWeeksPathPatternRaw(scopeId);
        const fileTpl = config.getWeeksFilePatternRaw(scopeId);

        const fullTpl = pathTpl + '/' + fileTpl;

        // Normalize the base path to forward slashes first (Windows path support),
        // then escape it as a regex literal.
        const normalizedBase = base.replace(/\\/g, '/');
        const escapedBase = normalizedBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Replace template vars with regex capture groups. Do NOT apply blanket
        // backslash normalization after this step — it would corrupt \d sequences.
        const regexStr = fullTpl
            .replace(/\$\{base\}/g, escapedBase)
            .replace(/\$\{year\}/g, '(\\d{4})')
            .replace(/\$\{week\}/g, '(\\d{1,2})')
            .replace(/\$\{ext\}/g, escapedExt);

        // Track which capture group corresponds to year vs week.
        const yearFirst = fullTpl.indexOf('${year}') < fullTpl.indexOf('${week}');

        try {
            const regex = new RegExp(regexStr + '$');
            const match = uriPath.match(regex);
            if (match) {
                const year  = parseInt(yearFirst ? match[1] : match[2], 10);
                const week  = parseInt(yearFirst ? match[2] : match[1], 10);
                return { week, year, scope };
            }
        } catch {
            // Malformed regex from an unusual pattern — skip this scope.
        }
    }

    return undefined;
}
