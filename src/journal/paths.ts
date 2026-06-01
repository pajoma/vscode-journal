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
import * as vscode from 'vscode';
import * as J from '..';
import { getDayAsString, prefixZero } from '../util/strings';
import { isNullOrUndefined } from '../util/util';
import { toMomentFormat } from './template-engine';
import moment = require('moment');

/**
* Returns the path for a given date as string
* @deprecated
*/
export async function getEntryPathForDate(date: Date, base: string, ext: string): Promise<string> {
    const pathStr = Path.join(getPathOfMonth(date, base), getDayAsString(date) + "." + ext);
    return Path.format(Path.parse(pathStr));
}

export function getPathAsString(path: Path.ParsedPath): string {
    return Path.format(path);
}

/**
 * Tries to infer a date from a given path (taken from vscode.TextDocument)
 * 
 * This function expects only paths to valid journal entries, scoped entries are ignored
 * 
 * Check direct test "path-parse-with-date" 
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
            const uriObj = vscode.Uri.parse(normalizedUri);
            const fsPath = uriObj.fsPath.replace(/\\/g, '/');
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
export async function getDateFromURIAndConfig(entryPath: string, configCtrl: J.VSCode.Configuration): Promise<Date> {
    const pathTpl = (await configCtrl.getResolvedEntryPath(new Date())).template;
    const entryTpl = (await configCtrl.getEntryFilePattern(new Date())).template;
    const base = (await configCtrl.getBasePath());

    return getDateFromURI(entryPath, pathTpl, entryTpl, base);

}


/**
 * Returns the filename of a given URI. 
 * Example: "21" of uri "file://some/path/to/21.md"
 * 
 * @param uri 
 * @param withExtension 
 * @returns 
 */
export function getFileInURI(uri: string, withExtension?: boolean): string {
    let p: string = uri.substr(uri.lastIndexOf("/") + 1, uri.length);
    if (withExtension === null || !withExtension) {
        return p.split(".")[0];
    } else {
        return p;
    }
}

/**
 * Returns path to month folder. 
 */
export function getPathOfMonth(date: Date, base: string): string {
    let year = date.getFullYear().toString();
    let month = prefixZero(date.getMonth() + 1);
    return Path.join(base, year, month);
}

/**
* Returns target for notes as string; 
*/
// TODO: this has to be reimplemented, should consider the configuration of the path for notes in different scopes
export async function getFilePathInDateFolder(date: Date, filename: string, base: string, ext: string): Promise<string> {
    try {
        let pathStr = Path.join(getPathOfMonth(date, base), getDayAsString(date), filename + "." + ext);
        let path: Path.ParsedPath = Path.parse(pathStr);
        return Path.format(path);
    } catch (error) {
        throw error;
    }
}

/**
*  Check if config dir exists, otherwise copy defaults from extension directory
*  We can't Q's nfcall, since those nodejs operations don't have (err,data) responses
* 
*  fs.exists does only return "true", see https://github.com/petkaantonov/bluebird/issues/418
*  @param path 
*/
export async function checkIfFileIsAccessible(path: string): Promise<void> {
    try {
        await vscode.workspace.fs.stat(vscode.Uri.file(path));
    } catch {
        throw new Error(`File not accessible: ${path}`);
    }
}


/** Context passed to inferType. All future fields must be optional (?:) to prevent shotgun surgery. */
export interface InferTypeContext {
    extension: string;
}

export function inferType(entry: Path.ParsedPath, ctx: InferTypeContext): J.Model.JournalPageType {

    if (!entry.ext.endsWith(ctx.extension)) {
        return J.Model.JournalPageType.attachment;
    } else if (entry.name.match(/^[\d\-_]+$/)) {
        return J.Model.JournalPageType.entry;
    } else {
        return J.Model.JournalPageType.note;
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
 * Tries to infer the week number, year, and scope from a weekly file URI by matching
 * the URI against the configured weeks path+file patterns for each known scope.
 *
 * Pattern variables supported: ${base}, ${year} → (\d{4}), ${week} → (\d{1,2}), ${ext}.
 * Returns undefined when no configured scope matches the URI.
 */
export async function getWeekFromURIAndConfig(
    uri: vscode.Uri,
    config: J.VSCode.Configuration
): Promise<{ week: number; year: number; scope: string } | undefined> {
    const ext = config.getFileExtension();
    const escapedExt = ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const uriPath = uri.fsPath.replace(/\\/g, '/');

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

export function isRemoteSession(): boolean {
    return !!vscode.env.remoteName;
}

export function toLocalFileUri(path: string): vscode.Uri {
    const normalized = path.replace(/\\/g, '/');
    const isWindowsDrivePath = /^[a-zA-Z]:\//.test(normalized);
    if (isWindowsDrivePath) {
        return vscode.Uri.parse(`${vscode.env.uriScheme}://file/${normalized}`);
    }
    if (normalized.startsWith('/')) {
        return vscode.Uri.parse(`${vscode.env.uriScheme}://file${normalized}`);
    }
    return vscode.Uri.parse(`${vscode.env.uriScheme}://file/${normalized}`);
}