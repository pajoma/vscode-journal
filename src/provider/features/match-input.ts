import { Logger } from "../../util/logger";
import { isNullOrUndefined, isNotNullOrUndefined, getDayOfWeekForString } from "../../util/";
import { Input } from "../../model/input";
import moment = require("moment");
import { getMonthForString } from "../../util/dates";

export type EntryGranularity = "daily" | "weekly";

/**
 * Feature responsible for parsing the user input and and extracting offset, flags and text.
 */
export class MatchInput {
    public today: Date;
    private scopeExpression: RegExp = /\s#\w+\s/;
    private expr: RegExp | undefined;


    constructor(public logger: Logger, public locale: string, public granularity: EntryGranularity = "daily") {
        this.today = new Date();
    }

    /**
     * Refresh `today` so that long-lived instances don't use a stale date.
     * Called at the start of every parseInput() invocation.
     */
    private refreshToday(): void {
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
        this.refreshToday();

        this.logger.trace("Entering parseInput() in features/InputMatcher.ts with input string '", inputString, "'");

        if (isNullOrUndefined(inputString)) {
            throw new Error("cancel");
        }

        try {
            const parsedInput = new Input();

            const res: RegExpMatchArray | null = inputString.match(this.getExpression());
            if (res === null) {
                throw new Error("cancel");
            }

            this.logger.trace(Object.entries(res!.groups!).map(([key, value]) => `${key}: ${value}`).join(', '));

            parsedInput.flags = this.extractFlags(res!);
            parsedInput.offset = this.extractOffset(res!);
            parsedInput.week = this.extractWeek(res!);
            parsedInput.text = this.extractText(res!);
            parsedInput.tags = this.extractTags(inputString);

            const userProvidedTemporalToken = this.hasTemporalToken(res!);

            if (parsedInput.hasFlags() && !parsedInput.hasMemo()) {
                throw new Error("No text found for memo or task");
            }

            if (!parsedInput.hasFlags() && parsedInput.hasMemo()) {
                parsedInput.flags = "memo";
            }

            // No temporal modifier in input and no explicit week: honor the configured
            // entryGranularity. Daily (default) keeps offset=0 (today); weekly redirects
            // the input to the current ISO week so downstream routing opens the weekly
            // entry. Explicit user input always wins because the temporal-token check
            // above short-circuits this block.
            if (!userProvidedTemporalToken && !parsedInput.hasWeek()) {
                if (this.granularity === "weekly") {
                    parsedInput.week = moment().week();
                    parsedInput.offset = NaN;
                } else {
                    parsedInput.offset = 0;
                }
            }

            this.logger.trace("Tokenized input: ", JSON.stringify(parsedInput));
            return parsedInput;

        } catch (error) {
            if (error instanceof Error) {
                this.logger.error("Failed to parse input from string '", inputString, "' do to reason: ", error.message);
            } else if (!(error instanceof Error && error.message === "cancel")) {
                this.logger.error("Failed to parse input from string '", inputString, "'");
            }
            throw error;
        }
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


    /**
     * Returns true when the user explicitly typed a temporal token
     * (shortcut, offset, ISO date, weekday, week reference, or month + day).
     * Distinguishes "the user said today" from "the user said nothing and we
     * picked a default."
     */
    private hasTemporalToken(inputGroups: RegExpMatchArray): boolean {
        const g = inputGroups.groups!;
        return isNotNullOrUndefined(g["shortcut"])
            || isNotNullOrUndefined(g["offset"])
            || isNotNullOrUndefined(g["iso"])
            || isNotNullOrUndefined(g["weekday"])
            || isNotNullOrUndefined(g["week"])
            || isNotNullOrUndefined(g["weekNum"])
            || (isNotNullOrUndefined(g["month"]) && isNotNullOrUndefined(g["dayOfMonth"]));
    }

    private extractFlags(inputGroups: RegExpMatchArray): string {
        const flagPre = inputGroups.groups!["flag"];
        const flagPost = inputGroups.groups!["flagPost"];

        if (isNotNullOrUndefined(flagPre)) { return flagPre; }
        if (isNotNullOrUndefined(flagPost)) { return flagPost; }
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

        if (isNotNullOrUndefined(modifier) && modifier.match(/l|last/)) {
            return now.subtract(1, "week").week();
        }

        if (isNotNullOrUndefined(modifier) && modifier.match(/n|next/)) {
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

        if ((isNotNullOrUndefined(month)) && (month! < 0 || month! > 11)) { throw new Error("Invalid value for month"); }
        if ((isNotNullOrUndefined(day)) && (day! < 1 || day! > 31)) { throw new Error("Invalid value for day"); }

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
            let next = (mod!.charAt(0).toLowerCase() === 'n') ? true : false;

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
        let diff = date.diff(current, "days");
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
            // Regular expression components
            const flagPattern = '(?<flag>task|todo)?\\s?';
            const shortcutPattern = '(?<shortcut>today|tod|yesterday|yes|tomorrow|tom|0)(?:\\s|$)';
            const offsetPattern = '(?<offset>(?:\\+|\\-)\\d+)(?:\\s|$)';
            const isoPattern = '(?<iso>(?:\\d{4}(?:\\-|\\/)\\d{1,2}(?:\\-|\\/)\\d{1,2})|(?:\\d{1,2}(?:\\-|\\/)\\d{1,2})|(?:\\d{1,2}))(?:\\s|$)';
            const modifierPattern = '(?<modifier>next|last|n\\b|l\\b)?\\s?';
            // const weekdayPattern = '(?<weekday>monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)?';
            const weekdayPattern = this.getWeekdayPattern();
            const weekPattern = '(?<week>w(?:eek)?(?:\\s\\D|$))';
            const weekNumPattern = 'w(?:eek)?\\s?(?<weekNum>[1-5]?[0-9])(?:\\s|$)';
            // const monthPattern = '(?<month>Jan|Feb|Mar|Apr|Apr(?:il)?|May|June?|July?|Aug(?:gust)?|Sep(?:tember)?|Oct(?:ober)?|Nov|Dec)+';
            const monthPattern = this.getMonthPattern();
            const dayOfMonthPattern = '\\s?(?<dayOfMonth>(?:[1-9]|1[0-9]|2[0-9]|3[0-1])(?:\\s|$))+';
            const flagPostPattern = '(?<flagPost>task|todo)?\\s?';
            const textPattern = '(?<text>.*)';

            //'(?<weekday>monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|lun(?:di)?|mar(?:di)?|mer(?:credi)?|jeu(?:di)?|ven(?:dredi)?|sam(?:edi)?|dim(?:anche)?|lunes?|martes?|mié(?:rcoles)?|jueves?|viernes?|sáb(?:ado)?|dom(?:ingo)?|lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica|segunda-feira|terça-feira|quarta-feira|quinta-feira|sexta-feira|sábado|domingo|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|xīngqī yī|xīngqī èr|xīngqī sān|xīngqī sì|xīngqī wǔ|xīngqī liù|xīngqī rì|getsuyōbi|kayōbi|suiyōbi|mokuyōbi|kin'yōbi|doyōbi|nichiyōbi|الإثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت|الأحد)?'

            // Full regular expression
            const regExpPattern = `^${flagPattern}(?:${shortcutPattern}|${offsetPattern}|${isoPattern}|${modifierPattern}(?:${weekdayPattern}|${weekPattern})?\\s?|${weekNumPattern}|${monthPattern}${dayOfMonthPattern})?${flagPostPattern}${textPattern}$`;

            // Compile the regular expression
            this.expr = new RegExp(regExpPattern, 'i');
        }

        return this.expr!;
    }


    private getMonthPattern(): string {
        // Issue #170: wrap the alternation in a non-capturing group with a trailing
        // (?=\s|$) lookahead so e.g. "Marathon" doesn't match "Mar". The named
        // group keeps the same alternation; the boundary asserts without consuming.
        // Alternations are joined without leading whitespace so long alternatives
        // like "January" remain reachable (template-literal indentation otherwise
        // becomes part of the pattern and prefixes the first alternative on each line).
        const alternatives = [
            // English
            'Jan(?:uary)?', 'Feb(?:ruary)?', 'Mar(?:ch)?', 'Apr(?:il)?', 'May', 'June?', 'July?', 'Aug(?:ust)?', 'Sep(?:tember)?', 'Oct(?:ober)?', 'Nov(?:ember)?', 'Dec(?:ember)?',
            // German
            'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'Okt(?:ober)?', 'Dez(?:ember)?',
            // French
            'Janv(?:ier)?', 'Fév(?:rier)?', 'Mars', 'Avr(?:il)?', 'Juin', 'Juil(?:let)?', 'Août', 'Sept(?:embre)?', 'Oct(?:obre)?', 'Nov(?:embre)?', 'Déc(?:embre)?',
            // Spanish
            'Ene(?:ro)?', 'Feb(?:rero)?', 'Mar(?:zo)?', 'Abr(?:il)?', 'May(?:o)?', 'Jun(?:io)?', 'Jul(?:io)?', 'Ago(?:sto)?', 'Sep(?:tiembre)?', 'Oct(?:ubre)?', 'Nov(?:iembre)?', 'Dic(?:iembre)?',
            // Italian
            'Gen(?:naio)?', 'Feb(?:braio)?', 'Mag(?:gio)?', 'Giu(?:gno)?', 'Lug(?:lio)?', 'Set(?:tembre)?', 'Ott(?:obre)?', 'Dic(?:embre)?',
            // Portuguese
            'Jan(?:eiro)?', 'Fev(?:ereiro)?', 'Mar(?:ço)?', 'Mai(?:o)?', 'Jun(?:ho)?', 'Jul(?:ho)?', 'Set(?:embro)?', 'Out(?:ubro)?', 'Nov(?:embro)?', 'Dez(?:embro)?',
            // Dutch
            'Jan(?:uari)?', 'Feb(?:ruari)?', 'Mrt', 'Mei', 'Jun(?:i)?', 'Jul(?:i)?', 'Aug(?:ustus)?',
            // Russian
            'Янв(?:арь)?', 'Фев(?:раль)?', 'Мар(?:т)?', 'Апр(?:ель)?', 'Май', 'Июн(?:ь)?', 'Июл(?:ь)?', 'Авг(?:уст)?', 'Сен(?:тябрь)?', 'Окт(?:ябрь)?', 'Ноя(?:брь)?', 'Дек(?:абрь)?',
            // Chinese (Pinyin)
            'yīyuè', 'èryuè', 'sānyuè', 'sìyuè', 'wǔyuè', 'liùyuè', 'qīyuè', 'bāyuè', 'jiǔyuè', 'shíyuè', 'shíyīyuè', "shí'èryuè",
            // Japanese (Romaji)
            'ichigatsu', 'nigatsu', 'sangatsu', 'shigatsu', 'gogatsu', 'rokugatsu', 'shichigatsu', 'hachigatsu', 'kugatsu', 'jugatsu', 'juichigatsu', 'juunigatsu',
            // Arabic
            'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
        ].join('|');
        return `(?:(?<month>${alternatives})(?=\\s|$))+`;
    }

    private getWeekdayPattern(): string {
        // Issue #170: the inner alternation lists bare two-letter weekday prefixes
        // (do, di, fr, sa, ...) which would otherwise substring-match inside ordinary
        // words like "Don Julio" or "Doel halen". The (?=\s|$) lookahead at the tail
        // (placed inside the outer optional group so it only fires when the weekday
        // actually matched) requires the token to end on a word boundary.
        // Alternations are listed longest-first inside each locale and joined without
        // leading whitespace so the named group can match the full forms.
        const alternatives = [
            // English (full first, then 3-letter abbreviations)
            'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
            'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
            // German (full first, then 2-3 letter abbreviations)
            'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag',
            'mit', 'di', 'do', 'fr', 'sa', 'so',
            // French
            'lun(?:di)?', 'mar(?:di)?', 'mer(?:credi)?', 'jeu(?:di)?', 'ven(?:dredi)?', 'sam(?:edi)?', 'dim(?:anche)?',
            // Spanish
            'lunes?', 'martes?', 'mié(?:rcoles)?', 'jueves?', 'viernes?', 'sáb(?:ado)?', 'dom(?:ingo)?',
            // Italian
            'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica',
            // Portuguese
            'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo',
            // Dutch
            'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag',
            // Russian
            'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье',
            // Chinese (Pinyin)
            'xīngqī yī', 'xīngqī èr', 'xīngqī sān', 'xīngqī sì', 'xīngqī wǔ', 'xīngqī liù', 'xīngqī rì',
            // Japanese (Romaji)
            'getsuyōbi', 'kayōbi', 'suiyōbi', 'mokuyōbi', "kin'yōbi", 'doyōbi', 'nichiyōbi',
            // Arabic
            'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد',
        ].join('|');
        return `(?:(?<weekday>${alternatives})(?=\\s|$))?`;
    }

}