import { Logger } from "../util/logger";
import { isNullOrUndefined, isNotNullOrUndefined, getDayOfWeekForString} from "../util/util";
import { Input } from "../model/input";

export class InputMatcher {
    public today: Date;
    private scopeExpression: RegExp = /\s#\w+\s/;
    private expr: RegExp | undefined;


    constructor(public logger: Logger) {
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
                if(error instanceof Error) {
                    this.logger.error("Failed to parse input from string '", inputString,"' do to reason: ", error.message);
                } else  {this.logger.error("Failed to parse input from string '", inputString,"'");}
                
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



    private extractText(inputGroups: string[]): string {
        /* Groups
            8: text of memo
        */
        return (inputGroups[8] === null) ? "" : inputGroups[8];
    }


    private extractFlags(inputGroups: string[]): string {
        /* Groups (see https://regex101.com/r/sCtPOb/2)
            1: flag "task"
            7: flag "task" 
        */

        let res = (isNotNullOrUndefined(inputGroups[1])) ? inputGroups[1] : inputGroups[7];
        return (isNullOrUndefined(res)) ? "" : res;
    }


    private extractOffset(inputGroups: string[]): number {

        /* Groups (see https://regex101.com/r/sCtPOb/2)
            2:today
            3:+22
            4:11-24
            5:"next"
            6:"monday"
        */

        if (isNotNullOrUndefined(inputGroups[2])) {
            return this.resolveShortcutString(inputGroups[2]);
        }
        if (isNotNullOrUndefined(inputGroups[3])) {
            return this.resolveOffsetString(inputGroups[3]);
        }
        if (isNotNullOrUndefined(inputGroups[4])) {
            return this.resolveISOString(inputGroups[4]);
        }
        if ((isNullOrUndefined(inputGroups[5])) && (isNotNullOrUndefined(inputGroups[6]))) {
            return this.resolveWeekday(inputGroups[6]);
        }
        if ((isNotNullOrUndefined(inputGroups[5])) && (isNotNullOrUndefined(inputGroups[6]))) {
            return this.resolveWeekday(inputGroups[6], inputGroups[5]);
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
        let searchedDay = getDayOfWeekForString(weekday);
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

        /*
        /^(?:(task|todo)\s)?(?:(?:(today|tod|yesterday|yes|tomorrow|tom|0)(?:\s|$))|(?:((?:\+|\-)\d+)(?:\s|$))|(?:((?:\d{4}\-\d{1,2}\-\d{1,2})|(?:\d{1,2}\-\d{1,2})|(?:\d{1,2}))(?:\s|$))|(?:(next|last|n|l)?\s?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\s?))?(?:(task|todo)\s)?(.*)$/
        */

        /* Groups (see https://regex101.com/r/sCtPOb/2) (! // -> /)
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
            let flagsRX = "(?:(task|todo)\\s)";
            let shortcutRX = "(?:(today|tod|yesterday|yes|tomorrow|tom|0)(?:\\s|$))";
            let offsetRX = "(?:((?:\\+|\\-)\\d+)(?:\\s|$))";
            // let isoDateRX = "(?:(\\d{4})\\-?(\\d{1,2})?\\-?(\\d{1,2})?\\s)"; 
            let isoDateRX = "(?:((?:\\d{4}\\-\\d{1,2}\\-\\d{1,2})|(?:\\d{1,2}\\-\\d{1,2})|(?:\\d{1,2}))(?:\\s|$))";
            let weekdayRX = "(?:(next|last|n|l)?\\s?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\\s?)";
            let weekOfYearRX = "(w\\d{1,2})";
            let completeExpression: string = "^" + flagsRX + "?(?:" + shortcutRX + "|" + offsetRX + "|" + isoDateRX + "|" + weekdayRX + "|" +weekOfYearRX+ ")?" + flagsRX + "?(.*)" + "$";
            // let completeExpression: string = "^" + flagsRX + "?(?:" + shortcutRX + "|" + offsetRX + "|" + isoDateRX + "|" + weekdayRX + ")?" + flagsRX + "?(.*)" + "$";
            // console.log(completeExpression);

            let offsetWeekRX = "(?:((?:\\+|\\-)\\d{1,2}w)(?:\\s|$))";
            let weekRX = "(?:(next|last|n|l)?\\s?(week|w)\\s?)";

            
            // let completeExpression: string = "^" + flagsRX + "?(?:" + shortcutRX + "|" + offsetRX + "|" + isoDateRX + "|" + weekdayRX + "|" + weekOfYearRX + "|" + offsetWeekRX + "|" + weekRX+")?" + flagsRX + "?(.*)" + "$";

            this.expr = new RegExp(completeExpression);
        }
        return this.expr!;
    }

}