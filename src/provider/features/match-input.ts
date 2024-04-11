import { Logger } from "../../util/logger";
import { isNullOrUndefined, isNotNullOrUndefined,  getDayOfWeekForString} from "../../util/";
import { Input } from "../../model/input";
import moment = require("moment");
import { getMonthForString } from "../../util/dates";

/**
 * Feature responsible for parsing the user input and and extracting offset, flags and text. 
 */
export class MatchInput {
    public today: Date;
    private scopeExpression: RegExp = /\s#\w+\s/;
    private expr: RegExp | undefined;


    constructor(public logger: Logger, public locale: string) {
        this.today = new Date();
    }

    /**
         * Takes a string and separates the flag, date and text
         *
         * @param {string} inputString the value to be parsed
         * @param {boolean} replaceSpecialCharacters if special characters like the # have to be normalized (e.g. for file names)
         * @returns {Q.Promise<J.Model.Input>} the resolved input object
         * @memberof Parser
         */
    public async parseInput(inputString: string): Promise<Input> {


        return new Promise<Input>((resolve, reject) => {
            this.logger.trace("Entering parseInput() in features/InputMatcher.ts with input string '", inputString, "'");

            if (isNullOrUndefined(inputString)) {
                reject("cancel");
            }

            try {
                let parsedInput = new Input();

                let res: RegExpMatchArray | null = inputString.match(this.getExpression());
                if (isNullOrUndefined(res)) { reject("cancel"); }

                parsedInput.flags = this.extractFlags(res!);
                parsedInput.offset = this.extractOffset(res!);
                parsedInput.week = this.extractWeek(res!);
                parsedInput.text = this.extractText(res!);
                parsedInput.tags = this.extractTags(inputString);


                // flags but no text, show error
                if (parsedInput.hasFlags() && !parsedInput.hasMemo()) {
                    reject("No text found for memo or task");
                }

                // text but no flags, we default to "memo" (for notes we ignore this later)
                if (!parsedInput.hasFlags() && parsedInput.hasMemo()) {
                    // but only if exceeds a certain length
                    // if (input.text.length > 6) {
                    parsedInput.flags = "memo";
                    // }
                }

                // if not temporal modifier in input, but flag and text, we default to today
                if (!parsedInput.hasOffset() && parsedInput.hasFlags() && parsedInput.hasMemo()) {
                    parsedInput.offset = 0;
                }

                resolve(parsedInput);

                this.logger.trace("Tokenized input: ", JSON.stringify(parsedInput));

            } catch (error) {
                if (error instanceof Error) {
                    this.logger.error("Failed to parse input from string '", inputString, "' do to reason: ", error.message);
                } else { this.logger.error("Failed to parse input from string '", inputString, "'"); }

                reject(error);
            }

        });
    }


    /**
     * If tags are present in the input string, extract them if these are configured scopes
     *
     * @private
     * @param {string[]} values
     * @returns {string}
     * @memberof Parser
     */
    private extractTags(inputString: string): string[] {
        let res: RegExpMatchArray | null = inputString.match(this.scopeExpression);
        return isNullOrUndefined(res) ? [""] : res!;
    }





    private extractText(inputGroups: RegExpMatchArray): string {
        const text = inputGroups.groups!["text"];
        /* Groups
            10: text of memo
        */
        return isNotNullOrUndefined(text) ? text : "";
    }


    private extractFlags(inputGroups: RegExpMatchArray): string {
        const flagPre = inputGroups.groups!["flag"];
        const flagPost = inputGroups.groups!["flagPost"];
        
        if(isNotNullOrUndefined(flagPre)) { return flagPre; } 
        if(isNotNullOrUndefined(flagPost)) { return flagPost; } 
        return ""; 
    }

    /**
     * Tries to extract the mentioned week
     * 
     * 
     */
    extractWeek(inputGroups: RegExpMatchArray): number {
        let week = inputGroups.groups!["week"];
        let weekNum = inputGroups.groups!["weekNum"];
        let modifier = inputGroups.groups!["modifier"];

        if (isNotNullOrUndefined(weekNum)) {
            return this.resolveNumberedWeek(weekNum);
        }

        if (isNotNullOrUndefined(week)) {
            return this.resolveRelatedWeek(modifier);
        }

        return -1; 

    }
    resolveRelatedWeek(modifier: string): number {
        let now = moment(); 

        if(isNotNullOrUndefined(modifier) && modifier.match(/l|last/)) {
            return now.subtract(1, "week").week(); 
        }

        if(isNotNullOrUndefined(modifier) &&  modifier.match(/n|next/)) {
            return now.add(1, "week").week(); 
        }

        return now.week(); 
    }

    /**
     * 
     * @param weekAsNumber numbered week, e.g. "w13"
     */
    resolveNumberedWeek(weekAsNumber: string): number {
        return parseInt(weekAsNumber); 
    }


    private extractOffset(inputGroups: RegExpMatchArray): number {
        let shortcut = inputGroups.groups!["shortcut"];
        let offset = inputGroups.groups!["offset"];
        let iso = inputGroups.groups!["iso"];
        let weekday = inputGroups.groups!["weekday"];
        let modifier = inputGroups.groups!["modifier"];
        let dayOfMonth = inputGroups.groups!["dayOfMonth"];
        let month = inputGroups.groups!["month"];

        if (isNotNullOrUndefined(shortcut)) {
            return this.resolveShortcutString(shortcut);
        }
        if (isNotNullOrUndefined(offset)) {
            return this.resolveOffsetString(offset);
        }
        if (isNotNullOrUndefined(iso)) {
            return this.resolveISOString(iso);
        }
        if (isNotNullOrUndefined(weekday)) {
            return this.resolveWeekday(weekday, modifier);
        }

        if (isNotNullOrUndefined(month) && isNotNullOrUndefined(dayOfMonth)) {

            return this.resolveDayOfMonth(month, dayOfMonth);
        }


        // default, we always return zero (as today)
        return 0;
    }




    private resolveOffsetString(inputString: string): number {
        if (inputString.startsWith("+", 0)) {
            return parseInt(inputString.substring(1, inputString.length));
        }
        else if (inputString.startsWith("-", 0)) {
            return parseInt(inputString.substring(1, inputString.length)) * -1;
        }
        return NaN;
    }

    private resolveShortcutString(inputString: string): number {
        if (inputString.match(/today|tod|heute|0/)) { return 0; }
        if (inputString.match(/tomorrow|tom|morgen/)) { return +1; }
        if (inputString.match(/yesterday|yes|gestern/)) { return -1; }
        return NaN;
    }

    /**
     * Resolves an ISO String and returns the offset to the current day
     * 
     * @param inputString  a date formatted as iso string, e.g. 06-22
     * @returns the offset to the current day
     */
    private resolveISOString(inputString: string): number {

        let todayInMS: number = Date.UTC(this.today.getFullYear(), this.today.getMonth(), this.today.getDate());

        inputString = inputString.replace("/", "-"); // american formatting, e.g. 11\12
        let dt: string[] = inputString.split("-");

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

        if ((isNotNullOrUndefined(month)) && (month! < 0 || month! > 12)) { throw new Error("Invalid value for month"); }
        if ((isNotNullOrUndefined(day)) && (day! < 0 || day! > 31)) { throw new Error("Invalid value for day"); }

        let inputInMS: number = 0;
        if (isNotNullOrUndefined(year)) {
            // full date with year (e.g. 2016-10-24)
            inputInMS = Date.UTC(parseInt(dt[0]), parseInt(dt[1]) - 1, parseInt(dt[2]));
        } else if (isNotNullOrUndefined(month)) {
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
    private resolveWeekday(weekday: string, mod?: string): number {

        // get name of weekday in input
        let searchedDay = getDayOfWeekForString(weekday, this.locale);
        let currentDay: number = this.today.getDay();
        let diff = searchedDay - currentDay;


        if (isNullOrUndefined(mod)) {
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
     * Parses strings like "Jun 1" and returns the offset from today
     * 
     * @param month 
     * @param dayOfMonth 
     * @returns 
     */
    private resolveDayOfMonth(month: string, dayOfMonth: string): number {
            let current = moment(); 
            let date = moment().month(getMonthForString(month)).date(parseInt(dayOfMonth)); 
            let diff =  date.diff(current, "days"); 
            return diff;
    }


    /** 
     * Takes any given string as input and tries to compute the offset from today's date. 
     * It translates something like "next wednesday" into "4" (if next wednesday is in four days). 
     *
     * @param {string} value the string to be processed
     * @returns {Q.Promise<number>}  the resolved offeset
     * @memberof Parser
     */
    private getExpression(): RegExp {
        /*
        v6 with week modifier https://regex101.com/r/sCtPOb/6
        (?:(task|todo)\s)?(?:(?:(today|tod|yesterday|yes|tomorrow|tom|0)(?:\s|$))|(?:((?:\+|\-)\d+)(?:\s|$))|(?:((?:\d{4}\-\d{1,2}\-\d{1,2})|(?:\d{1,2}\-\d{1,2})|(?:\d{1,2}))(?:\s|$))|(?:(next|last|n|l)?\s?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\s?))?(?:(task|todo)\s)?(.*)

        v8 (with Month + Day) https://regex101.com/r/sCtPOb/7
      ^(?:(?<flag>task|todo)\s)?(?:(?:(?:(?<shortcut>today|tod|yesterday|yes|tomorrow|tom|0)(?:\s|$)))|(?:(?<offset>(?:\+|\-)\d+)(?:\s|$))|(?:(?<iso>(?:\d{4}(?:\-|\\)\d{1,2}(?:\-|\\)\d{1,2})|(?:\d{1,2}(?:\-|\\)\d{1,2})|(?:\d{1,2}))(?:\s|$))|(?:(?<modifier>next|last|n|l)?\s?(?:(?<weekday>monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)?|(?<week>w(?:eek)?(?:\s\D|$)))?\s?)|(?:w(?:eek)?\s?(?<weekNum>[1-5]?[0-9])(?:\s|$))|(?:(?<month>Jan|Feb|Mar|Apr|Apr(?:il)?|May|June?|July?|Aug(?:gust)?|Sep(?:tember)?|Oct(?:ober)?|Nov|Dec)+)+\s?(?<dayOfMonth>(?:[1-9]|1[0-9]|2[0-9]|3[0-1])(?:\s|$))+)?(?:(?<flagPost>task|todo)\s)?(?<text>.*)$
        

    

        Groups (see https://regex101.com/r/sCtPOb) (! // -> /)
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
        if (isNullOrUndefined(this.expr)) {
            // see links above for current version in regexp.com
            let regExp = /^(?:(?<flag>task|todo)\s)?(?:(?:(?:(?<shortcut>today|tod|yesterday|yes|tomorrow|tom|0)(?:\s|$)))|(?:(?<offset>(?:\+|\-)\d+)(?:\s|$))|(?:(?<iso>(?:\d{4}(?:\-|\/)\d{1,2}(?:\-|\/)\d{1,2})|(?:\d{1,2}(?:\-|\/)\d{1,2})|(?:\d{1,2}))(?:\s|$))|(?:(?<modifier>next|last|n\b|l\b)?\s?(?:(?<weekday>monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)?|(?<week>w(?:eek)?(?:\s\D|$)))?\s?)|(?:w(?:eek)?\s?(?<weekNum>[1-5]?[0-9])(?:\s|$))|(?:(?<month>Jan|Feb|Mar|Apr|Apr(?:il)?|May|June?|July?|Aug(?:gust)?|Sep(?:tember)?|Oct(?:ober)?|Nov|Dec)+)+\s?(?<dayOfMonth>(?:[1-9]|1[0-9]|2[0-9]|3[0-1])(?:\s|$))+)?(?:(?<flagPost>task|todo)\s)?(?<text>.*)$/;                     
            this.expr = new RegExp(regExp);
        }
        return this.expr!;
    }

}