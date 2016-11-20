'use strict';

import * as Q from 'q';
import * as journal from './';


/**
 * Utility Methods for the vscode-journal extension
 */
export class Util {

    constructor(public config: journal.Configuration) {

    }

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


    public formatDate(date: Date): string {
        let dateFormatOptions: Intl.DateTimeFormatOptions = {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric"
        };
        return date.toLocaleDateString(this.config.getLocale(), dateFormatOptions);
    }

    public prefixZero(nr: number): string {
        let current = nr.toString();
        if (current.length == 1) current = '0' + current;
        return current;
    }

    private getPathSection(date: Date): string {
        let year = date.getFullYear().toString();
        let month = this.prefixZero(date.getMonth() + 1);
        let day = this.prefixZero(date.getDate());
        return '/' + year + '/' + month + '/' + day;
    }

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
     * Returns the path for a given date
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