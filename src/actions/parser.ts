// Copyright (C) 2018  Patrick Maué
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
import * as J from '../.';
import * as Path from 'path';

import { SCOPE_DEFAULT } from '../ext';

/**
 * Helper Methods to interpret the input strings
 */
export class Parser {
    public today: Date;
    private expr: RegExp | undefined;
    private scopeExpression: RegExp = /\s#\w+\s/;



    constructor(public ctrl: J.Util.Ctrl) {
        this.today = new Date();
    }

    /**
     * Returns the file path for a given input. If the input includes a scope classifier ("#scope"), the path will be altered 
     * accordingly (depending on the configuration of the scope). 
     *
     * @param {string} input the input entered by the user
     * @returns {Q.Promise<string>} the path to the new file
     * @memberof JournalCommands
     * 
     * TODO: enable Scopes
     */
    public resolveNotePathForInput(input: J.Model.Input, scopeId?: string): Q.Promise<string> {
        this.ctrl.logger.trace("Entering resolveNotePathForInput() in actions/parser.ts");

        return Q.Promise<string>((resolve, reject) => {

            // Unscoped Notes are always created in today's folder
            let date = new Date();
            let path: string = "";
            input.scope = SCOPE_DEFAULT;  

            // purge all tags from filename

            // all tags are filtered out. tags representing scopes are recognized here for resolving the note path.
            input.text.match(/#\w+\s/g)?.forEach(tag => {
                if(J.Util.isNullOrUndefined(tag) || tag!.length == 0) return; 

                this.ctrl.logger.trace("Tags in input string: "+tag);
                
                // remove from value
                input.tags.push(tag.trim().substr(0, tag.length-1)); 
                input.text = input.text.replace(tag, " "); 

                // identify scope, input is #tag
                this.ctrl.logger.trace("Scopes defined in configuration: "+this.ctrl.configuration.getScopes());
                let scope: string | undefined = this.ctrl.configuration.getScopes().filter(name => name == tag.trim().substring(1, tag.length)).pop(); 
               
                
                if(J.Util.isNotNullOrUndefined(scope) && scope!.length > 0) {
                    input.scope = scope!; 
                } 
                
                this.ctrl.logger.trace("Identified scope in input: "+input.scope);
                
            });


            let inputForFileName: string = J.Util.normalizeFilename(input.text)

            Q.all([
                this.ctrl.configuration.getNotesFilePattern(date, inputForFileName, input.scope), 
                this.ctrl.configuration.getNotesPathPattern(date, input.scope), 
                ])
            .then(([fileTemplate, pathTemplate]) => {
                path = Path.resolve(pathTemplate.value!, fileTemplate.value!);
                this.ctrl.logger.trace("Resolved path for note is", path);
                resolve(path); 
            })
            .catch(error => {
                this.ctrl.logger.error(error);
                reject(error);

            })
            .done();

        }); 

    }



    public parseNotesInput(value: string): Q.Promise<J.Model.Input> {
        return Q.Promise<J.Model.Input>((resolve, reject) => {
            this.ctrl.logger.trace("Entering parseNotesInput() in actions/parser.ts");

            if (J.Util.isNullOrUndefined(value)) {
                reject("cancel");
            }

            // generate filename



        });
    }

    public parseNotetile(value: string): Q.Promise<J.Model.Input> {
        return Q.Promise<J.Model.Input>((resolve, reject) => {
            new J.Model.Input(0); 
        }); 
    }


    /**
     * Takes a string and separates the flag, date and text
     *
     * @param {string} value the value to be parsed
     * @param {boolean} replaceSpecialCharacters if special characters like the # have to be normalized (e.g. for file names)
     * @returns {Q.Promise<J.Model.Input>} the resolved input object
     * @memberof Parser
     */
    public parseInput(value: string): Q.Promise<J.Model.Input> {
        this.ctrl.logger.trace("Entering parseInput() in actions/parser.ts");

        return Q.Promise<J.Model.Input>((resolve, reject) => {
            if (J.Util.isNullOrUndefined(value)) {
                reject("cancel");
            }

            try {
                let input = new J.Model.Input();
                this.today = new Date();

                let res: RegExpMatchArray | null = value.match(this.getExpression());
                if (J.Util.isNullOrUndefined(res)) { reject("cancel"); }

                input.flags = this.extractFlags(res!);
                input.offset = this.extractOffset(res!);
                input.text = this.extractText(res!);
                input.tags = this.extractTags(value);

                // flags but no text, show error
                if (input.hasFlags() && !input.hasMemo()) {
                    reject("No text found for memo or task");
                }

                // text but no flags, we default to "memo" (for notes we ignore this later)
                if (!input.hasFlags() && input.hasMemo()) {
                    // but only if exceeds a certain length
                    // if (input.text.length > 6) {
                        input.flags = "memo";
                    // }
                }

                // if not temporal modifier in input, but flag and text, we default to today
                if (!input.hasOffset() && input.hasFlags() && input.hasMemo()) {
                    input.offset = 0;
                }

                resolve(input);

                this.ctrl.logger.debug("Tokenized input: ", JSON.stringify(input));

            } catch (error) {
                this.ctrl.logger.error("Failed to parse input from string: ", value);
                reject(error);
            }

        });
    }


    /** PRIVATE FROM HERE **/


    /**
     * If tags are present in the input string, extract them if these are configured scopes
     *
     * @private
     * @param {string[]} values
     * @returns {string}
     * @memberof Parser
     */
    private extractTags(value: string): string[] {
        let res: RegExpMatchArray | null = value.match(this.scopeExpression);
        return J.Util.isNullOrUndefined(res) ? [""] : res!; 
    }



    private extractText(values: string[]): string {
        /* Groups
            8: text of memo
        */
        return (values[8] === null) ? "" : values[8];
    }


    private extractFlags(values: string[]): string {
        /* Groups (see https://regex101.com/r/sCtPOb/2)
            1: flag "task"
            7: flag "task" 
        */

        let res = (J.Util.isNotNullOrUndefined(values[1])) ? values[1] : values[7];
        return (J.Util.isNullOrUndefined(res)) ? "" : res;
    }


    private extractOffset(values: string[]): number {

        /* Groups (see https://regex101.com/r/sCtPOb/2)
            2:today
            3:+22
            4:11-24
            5:"next"
            6:"monday"
        */

        if (J.Util.isNotNullOrUndefined(values[2])) {
            return this.resolveShortcutString(values[2]);
        }
        if (J.Util.isNotNullOrUndefined(values[3])) {
            return this.resolveOffsetString(values[3]);
        }
        if (J.Util.isNotNullOrUndefined(values[4])) {
            return this.resolveISOString(values[4]);
        }
        if ((J.Util.isNullOrUndefined(values[5])) && (J.Util.isNotNullOrUndefined(values[6]))) {
            return this.resolveWeekday(values[6]);
        }
        if ((J.Util.isNotNullOrUndefined(values[5])) && (J.Util.isNotNullOrUndefined(values[6]))) {
            return this.resolveWeekday(values[6], values[5]);
        }


        // default, we always return zero (as today)
        return 0;
    }



    private resolveOffsetString(value: string): number {
        if (value.startsWith("+", 0)) {
            return parseInt(value.substring(1, value.length));
        }
        else if (value.startsWith("-", 0)) {
            return parseInt(value.substring(1, value.length)) * -1;
        }
        return NaN;
    }

    private resolveShortcutString(value: string): number {
        if (value.match(/today|tod|heute|0/)) { return 0; }
        if (value.match(/tomorrow|tom|morgen/)) { return +1; }
        if (value.match(/yesterday|yes|gestern/)) { return -1; }
        return NaN;
    }

    /**
     * Resolves an ISO String and returns the offset to the current day
     * 
     * @param value  a date formatted as iso string, e.g. 06-22
     * @returns the offset to the current day
     */
    public resolveISOString(value: string): number {

        let todayInMS: number = Date.UTC(this.today.getFullYear(), this.today.getMonth(), this.today.getDate());
        let dt: string[] = value.split("-");

        let year: number | undefined, month: number | undefined, day: number | undefined;
        if (dt.length >= 3) {
            year = parseInt(dt[0]);
            month = parseInt(dt[1]) - 1;
            day = parseInt(dt[2]);
        } else if (dt.length >= 2) {
            month = parseInt(dt[0]) - 1;
            day = parseInt(dt[1]);
        } else {
            day = parseInt(dt[0]);
        }

        if ((J.Util.isNotNullOrUndefined(month)) && (month! < 0 || month! > 12)) { throw new Error("Invalid value for month"); }
        if ((J.Util.isNotNullOrUndefined(day)) && (day! < 0 || day! > 31)) { throw new Error("Invalid value for day"); }

        let inputInMS: number = 0;
        if (J.Util.isNotNullOrUndefined(year)) {
            // full date with year (e.g. 2016-10-24)
            inputInMS = Date.UTC(parseInt(dt[0]), parseInt(dt[1]) - 1, parseInt(dt[2]));
        } else if (J.Util.isNotNullOrUndefined(month)) {
            // month and day (eg. 10-24)

            inputInMS = Date.UTC(this.today.getFullYear(), parseInt(dt[0]) - 1, parseInt(dt[1]));
        } else if (day) {
            // just a day
            inputInMS = Date.UTC(this.today.getFullYear(), this.today.getMonth(), parseInt(dt[0]));
        } else {
            throw new Error("Failed to parse the date");
        }

        let result: number = Math.floor((inputInMS - todayInMS) / (1000 * 60 * 60 * 24));
        return result;
    }

    /**
     * Resolves the weekday for a given string. Allowed strings are monday to friday. If a modifier is present 
     * ("next" or "last"), it will return the according weekdey of last or next week. 
     * 
     * @param weekday the weekday as a string 
     * @param mod next or last 
     * @returns the offset to the current day as number
     */
    public resolveWeekday(weekday: string, mod?: string): number {

        // get name of weekday in input
        let searchedDay = J.Util.getDayOfWeekForString(weekday);
        let currentDay: number = this.today.getDay();
        let diff = searchedDay - currentDay;


        if (J.Util.isNullOrUndefined(mod)) {
            return diff;

        } else {
            // toggle mode (next or last)
            let next = (mod!.charAt(0) === 'n') ? true : false;

            //   today is wednesday (currentDay = 3)
            // 'last monday' (default day of week: 1)
            if (!next && diff < 0) {
                // diff = -2 (offset)         
                return diff;

                // 'last friday' (default day of week: 5)
            } else if (!next && diff >= 0) {
                // diff = 2; 2-7 = -5 (= offset)
                return (diff - 7);

                // 'next monday' (default day of week: 1)
            } else if (next && diff <= 0) {
                // diff = -2, 7-2 = 5 (offset)
                return (diff + 7);

                // 'next friday' (default day of week: 5)
            } else if (next && diff > 0) {
                // diff = 2 (offset)
                return diff;
            }
        }

        return NaN;
    }


    /**
     * Takes any given string as input and tries to compute the offset from today's date. 
     * It translates something like "next wednesday" into "4" (if next wednesday is in four days). 
     *
     * @param {string} value the string to be processed
     * @returns {Q.Promise<number>}  the resolved offeset
     * @memberof Parser
     */
    private getExpression() : RegExp {
        /*
        (?:(task|todo)\s)?(?:(?:(today|tod|yesterday|yes|tomorrow|tom|0)(?:\s|$))|(?:((?:\+|\-)\d+)(?:\s|$))|(?:((?:\d{4}\-\d{1,2}\-\d{1,2})|(?:\d{1,2}\-\d{1,2})|(?:\d{1,2}))(?:\s|$))|(?:(next|last|n|l)?\s?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\s?))?(?:(task|todo)\s)?(.*)
        */

        /* Groups (see https://regex101.com/r/sCtPOb/2)
            1: flag "task"
            2: shortcut "today"
            3: offset "+1"
            4: iso date "2012-12-23"
            5: month and day "12-23"
            6: day of month "23"
            7: weekday flag "next"
            8: weekday name "monday"
            9: flag "task" 
            10: text of memo


            0:"..."
            1:task
            2:today
            3:+22
            4:11-24
            5:"next"
            6:"monday"
            7:"task"
            8:"hello world"
        */
        if (J.Util.isNullOrUndefined(this.expr)) {
            let flagsRX = "(?:(task|todo)\\s)";
            let shortcutRX = "(?:(today|tod|yesterday|yes|tomorrow|tom|0)(?:\\s|$))";
            let offsetRX = "(?:((?:\\+|\\-)\\d+)(?:\\s|$))";
            // let isoDateRX = "(?:(\\d{4})\\-?(\\d{1,2})?\\-?(\\d{1,2})?\\s)"; 
            let isoDateRX = "(?:((?:\\d{4}\\-\\d{1,2}\\-\\d{1,2})|(?:\\d{1,2}\\-\\d{1,2})|(?:\\d{1,2}))(?:\\s|$))";
            let weekdayRX = "(?:(next|last|n|l)?\\s?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\\s?)";

            let completeExpression: string = "^" + flagsRX + "?(?:" + shortcutRX + "|" + offsetRX + "|" + isoDateRX + "|" + weekdayRX + ")?" + flagsRX + "?(.*)" + "$";
            // console.log(completeExpression);

            this.expr = new RegExp(completeExpression);
        }
        return this.expr!;
    }


}

