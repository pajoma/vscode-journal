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

import { isNotNullOrUndefined } from '.';


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
    input = input.replace(/-/g, " ");

    return input;
}

export function stringIsNotEmpty(value: string | undefined | null) : boolean {
    return value !== null && value !== undefined && value.length > 0; 
}

export function isString(object: any | string | undefined ): boolean {
    return isNotNullOrUndefined(object) && typeof object === 'string';
}



export function  replaceVariableValue(key: string, value: string, template: string): string {
    if (template.search("\\$\\{" + key + "\\}") >= 0) {
        return template.replace("${" + key + "}", value);
    } else {
        return template;
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