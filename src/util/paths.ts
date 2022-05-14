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
import * as fs from 'fs';
import * as J from '..';
import { getDayAsString, prefixZero } from './strings';
import { isNullOrUndefined } from './util';
import { replaceDateTemplatesWithMomentsFormats } from './dates';
import moment = require('moment');

/**
* Returns the path for a given date as string
* @deprecated
*/
export function getEntryPathForDate(date: Date, base: string, ext: string): Promise<string> {

    return new Promise<string>((resolve, reject) => {
        try {
            let pathStr = Path.join(getPathOfMonth(date, base), getDayAsString(date) + "." + ext);
            let path: Path.ParsedPath = Path.parse(pathStr);
            resolve(Path.format(path));

        } catch (error) {
            reject(error);
        }
    });
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

    // go through each element in path and assign it to a date part or skip it
    let pathParts = uri.split("/");

    // check if part is in base path (if yes, we ignore)
    // for the rest: last part is file, everything else path pattern
    let pathElements: string[] = [];
    let trimmedPathString: string = "";
    let trimmedFileString = "";

    pathParts.forEach((element, index) => {
        if (element.trim().length === 0) { return; }
        else if (element.startsWith("file:")) { return; }
        else if (basePath.search(element) >= 0) { return; }
        else if (index + 1 === pathParts.length) { trimmedFileString = element.substr(0, element.lastIndexOf(".")); }
        else {
            pathElements.concat(element);
            if (trimmedPathString.length > 1) { trimmedPathString += "/"; }
            trimmedPathString += element;
        }
    });


    const entryDateFormat = replaceDateTemplatesWithMomentsFormats(fileTemplate);
    const pathDateFormat = replaceDateTemplatesWithMomentsFormats(pathTemplate);

    let parsedDateFromFile = moment(trimmedFileString, entryDateFormat);
    let parsedDateFromPath = moment(trimmedPathString, pathDateFormat);

    let result = moment();

    // consolidate the two
    if (fileTemplate.indexOf("${year}") >= 0) { result = result.year(parsedDateFromFile.year()); }
    else { result = result.year(parsedDateFromPath.year()); }
    if (fileTemplate.indexOf("${month}") >= 0) { result = result.month(parsedDateFromFile.month()); }
    else { result = result.month(parsedDateFromPath.month()); }
    if (fileTemplate.indexOf("${day}") >= 0) { result = result.date(parsedDateFromFile.date()); }
    else { result = result.date(parsedDateFromPath.date()); }

    return result.toDate();

}

/**
 * Tries to infer a date from a given path (taken from vscode.TextDocument)
 * 
 * This function expects only paths to valid journal entries, scoped entries are ignored
 * 
 * @param entryPath 
 */
export async function getDateFromURIAndConfig(entryPath: string, configCtrl: J.Extension.Configuration): Promise<Date> {
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
    return new Promise((resolve, reject) => {
        fs.access(path, err => {
            if (isNullOrUndefined(err)) { resolve(); }
            else { reject((<NodeJS.ErrnoException>err).message); }
        });
    });
}


/**
 * Tries to infer the file type from the path by matching against the configured patterns
 * @param entry - path to entry
 * @param ext - configured standard extension 
 */
export function inferType(entry: Path.ParsedPath, extension: string): J.Model.JournalPageType {

    if (!entry.ext.endsWith(extension)) {
        return J.Model.JournalPageType.attachement; // any attachement
    } else

        // this is getting out of hand if we need to infer it by scanning the patterns from the settings.
        // We keep it simple: if the filename contains only digits and special chars, we assume it 
        // is a journal entry. Everything else is a journal note. 
        if (entry.name.match(/^[\d|\-|_]+$/gm)) {
            return J.Model.JournalPageType.entry; // any entry
        } else {
            return J.Model.JournalPageType.note; // anything else is a note
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