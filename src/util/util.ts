// Copyright (C) 2016  Patrick Maué
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
import * as journal from './';


/**
 * Utility Methods for the vscode-journal extension
 */
export class Util {

    constructor(public config: journal.Configuration) {

    }
    /**
     * Return day of week for given string. W
     */
    public getDayOfWeekForString(day: string): number {
        day = day.toLowerCase();
        if (day.match(/monday|mon|montag/)) return 1;
        if (day.match(/tuesday|tue|dienstag/)) return 2;
        if (day.match(/wednesday|wed|mittwoch/)) return 3;
        if (day.match(/thursday|thu|donnerstag/)) return 4;
        if (day.match(/friday|fri|freitag/)) return 5;
        if (day.match(/saturday|sat|samstag/)) return 6;
        if (day.match(/sunday|sun|sonntag/)) return 7;
        return -1;
    }

    /**
     * Formats a given Date in long format (for Header in journal pages)
     */
    public formatDate(date: Date): string {
        let dateFormatOptions: Intl.DateTimeFormatOptions = {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric"
        };
        return date.toLocaleDateString(this.config.getLocale(), dateFormatOptions);
    }

    /**
     * Takes a number and a leading 0 if it is only one digit, e.g. 9 -> "09"
     */
    public prefixZero(nr: number): string {
        let current = nr.toString();
        if (current.length == 1) current = '0' + current;
        return current;
    }

    /**
     * Returns the path section within the base directory according the given date, e.g. 2016/05/23 for 2016-05-23
     */
    private getPathSection(date: Date): string {
        let year = date.getFullYear().toString();
        let month = this.prefixZero(date.getMonth() + 1);
        let day = this.prefixZero(date.getDate());
        return '/' + year + '/' + month + '/' + day;
    }

    /**
     * Returns target  for notes as string; 
     */
    public getFilePathInDateFolder(date: Date, filename: string): Q.Promise<string> {
        let deferred: Q.Deferred<string> = Q.defer<string>();

        let path = this.config.getBasePath() +
            this.getPathSection(date) + '/' +
            filename +
            this.config.getFileExtension();

        deferred.resolve(path);

        return deferred.promise;
    }

    /**
     * Returns the path for a given date as string
     */
    public getDateFile(date: Date): Q.Promise<string> {
        var deferred: Q.Deferred<string> = Q.defer<string>();

        let path = this.config.getBasePath()
            + this.getPathSection(date)
            + this.config.getFileExtension();

        deferred.resolve(path);
        return deferred.promise;
    }
}   