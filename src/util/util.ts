// Copyright (C) 2018 Patrick Maué
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

import * as Q from 'q';
import * as Path from 'path';
import * as fs from 'fs';
import moment from 'moment';
import { types } from 'util';

/**
 * Utility Methods for the vscode-journal extension
 */



/**
*  Check if config dir exists, otherwise copy defaults from extension directory
*  We can't Q's nfcall, since those nodejs operations don't have (err,data) responses
* 
*  fs.exists does only return "true", see https://github.com/petkaantonov/bluebird/issues/418
*  @param path 
*/
export function checkIfFileIsAccessible(path: string): Q.Promise<void> {
    let deferred: Q.Deferred<void> = Q.defer();
    Q.nfcall(fs.access, path)
        .then((err) => {
            if (isNullOrUndefined(err)) { deferred.resolve(); }
            else { deferred.reject((<NodeJS.ErrnoException>err).message); }
        });
    return deferred.promise;
}


/**
 * Return day of week for given string. 
 */
export function getDayOfWeekForString(day: string): number {
    day = day.toLowerCase();
    if (day.match(/monday|mon|montag/)) { return 1; }
    if (day.match(/tuesday|tue|dienstag/)) { return 2; }
    if (day.match(/wednesday|wed|mittwoch/)) { return 3; }
    if (day.match(/thursday|thu|donnerstag/)) { return 4; }
    if (day.match(/friday|fri|freitag/)) { return 5; }
    if (day.match(/saturday|sat|samstag/)) { return 6; }
    if (day.match(/sunday|sun|sonntag/)) { return 7; }
    return -1;
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
* Returns target  for notes as string; 
*/
// TODO: this has to be reimplemented, should consider the configuration of the path for notes in different scopes
export function getFilePathInDateFolder(date: Date, filename: string, base: string, ext: string): Q.Promise<string> {
    return Q.Promise<string>((resolve, reject) => {
        try {
            let pathStr = Path.resolve(getPathOfMonth(date, base), getDayAsString(date), filename + "." + ext);
            let path: Path.ParsedPath = Path.parse(pathStr);
            resolve(Path.format(path));

        } catch (error) {
            reject(error);
        }
    });
}




/**
* Returns the path for a given date as string
* @deprecated
*/
export function getEntryPathForDate(date: Date, base: string, ext: string): Q.Promise<string> {

    return Q.Promise<string>((resolve, reject) => {
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
 * Returns the filename of a given URI. 
 * Example: "21" of uri "file://some/path/to/21.md""
 * @param uri 
 */
export function getFileInURI(uri: string, withExtension?: boolean): string {
    let p: string = uri.substr(uri.lastIndexOf("/") + 1, uri.length);
    if (withExtension === null || !withExtension) {
        return p.split(".")[0];
    } else {
        return p;
    }
}

export function getNextLine(content: string): string[] {

    let res: string[] = ["", ""];

    let pos: number = content.indexOf('\n');
    if (pos > 0) {
        res[0] = content.slice(0, pos);
        res[1] = content.slice(pos + 1, content.length);
    } else {
        res[0] = content;
    }
    return res;
}




/**
 * Returns path to month folder. 
 */
export function getPathOfMonth(date: Date, base: string): string {
    let year = date.getFullYear().toString();
    let month = prefixZero(date.getMonth() + 1);
    return Path.resolve(base, year, month);
}


export function getDayAsString(date: Date): string {
    return prefixZero(date.getDate());
}

/**
* Takes a number and a leading 0 if it is only one digit, e.g. 9 -> "09"
*/
export function prefixZero(nr: number): string {
    let current = nr.toString();
    if (current.length === 1) { current = '0' + current; }
    return current;
}


/**
 * Returns a normalized filename for given string. Special characters will be replaced. 
 * @param input 
 */
export function normalizeFilename(input: string): string {
    let result = input.trim();
    result = result.replace(/\s/g, '_');
    result = result.replace(/\\|\/|\<|\>|\:|\n|\||\?|\*/g, '-');
    return result;
}

/**
 * Converts a filename into its readable form (for file links)
 * 
 * @param input the line to convert
 * @param ext the file extension used for notes and journal entries
 */
export function denormalizeFilename(input: string): string {
    
    input = input.substring(0, input.lastIndexOf("."));
    input = input.replace(/_/g, " ");


    return input;
}


export function isNullOrUndefined(value: any | undefined | null): boolean {
    return value === null || value === undefined;
}



export function isNotNullOrUndefined(value: any | undefined | null): boolean {
    return value !== null && value !== undefined;
}


export function stringIsNotEmpty(value: string | undefined | null) : boolean {
    return value !== null && value !== undefined && value.length > 0; 
}

export function isString(object: any | string | undefined ): boolean {
    return isNotNullOrUndefined(object) && typeof object === 'string';
}

export function isError(object: any | Error | undefined ): boolean {
    return isNotNullOrUndefined(object) && types.isNativeError(object);
}