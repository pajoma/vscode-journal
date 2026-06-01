import { Logger } from "../util/logger";
import { isNullOrUndefined, isNotNullOrUndefined, getDayOfWeekForString } from "../util/";
import { Input, ParseConfidence } from "../model/input";
import moment = require("moment");
import { getMonthForString, getCurrentISOWeek } from "../util/dates";

export type EntryGranularity = "daily" | "weekly";

// ---------------------------------------------------------------------------
// Tokenizer types
// ---------------------------------------------------------------------------

type TokenType =
    | 'flag' | 'shortcut' | 'offset' | 'iso'
    | 'weekNum' | 'week' | 'modifier' | 'weekday'
    | 'month' | 'dayOfMonth' | 'text';

interface Token { type: TokenType; value: string; }

interface RecognizerResult { token: Token; end: number; ambiguous?: boolean; }

interface TokenizeResult { tokens: Token[]; confidence: ParseConfidence; }

/**
 * Feature responsible for parsing the user input and and extracting offset, flags and text.
 */
export class MatchInput {
    public today: Date;
    private scopeExpression: RegExp = /\s#\w+\s/;
    private expr: RegExp | undefined;
    private _weekdayPatterns: RegExp[] | undefined;
    private _monthPatterns: RegExp[] | undefined;

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
            // --- regex path (authoritative during parallel phase) ---
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

            if (!userProvidedTemporalToken && !parsedInput.hasWeek()) {
                if (this.granularity === "weekly") {
                    parsedInput.week = moment().week();
                    parsedInput.offset = NaN;
                } else {
                    parsedInput.offset = 0;
                }
            }

            // --- tokenizer path (parallel, not yet authoritative) ---
            try {
                const { tokens, confidence } = this.tokenize(inputString);
                const tokenInput = this.tokensToInput(tokens);
                tokenInput.tags = this.extractTags(inputString);
                tokenInput.confidence = confidence;

                if (!this.inputsEqual(parsedInput, tokenInput)) {
                    this.logger.debug(
                        "tokenizer divergence for input '", inputString, "':",
                        JSON.stringify({ regex: { offset: parsedInput.offset, week: parsedInput.week, flags: parsedInput.flags, text: parsedInput.text }, tokenizer: { offset: tokenInput.offset, week: tokenInput.week, flags: tokenInput.flags, text: tokenInput.text } })
                    );
                } else {
                    parsedInput.confidence = confidence;
                }
            } catch (tokErr) {
                this.logger.debug("tokenizer error for input '", inputString, "':", tokErr instanceof Error ? tokErr.message : String(tokErr));
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

    private inputsEqual(a: Input, b: Input): boolean {
        const nanEq = (x: number, y: number) => (isNaN(x) && isNaN(y)) || x === y;
        return nanEq(a.offset, b.offset)
            && a.week === b.week
            && a.flags === b.flags
            && a.text === b.text;
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


    // -------------------------------------------------------------------------
    // Tokenizer — Steps 2-5 of the plan
    // -------------------------------------------------------------------------

    private wordEnd(input: string, pos: number): boolean {
        return pos >= input.length || /\s/.test(input[pos]);
    }

    private skipWs(input: string, pos: number): number {
        while (pos < input.length && /\s/.test(input[pos])) { pos++; }
        return pos;
    }

    private recognizeFlag(input: string, pos: number): RecognizerResult | null {
        const m = input.slice(pos).match(/^(task|todo)(?=\s|$)/i);
        if (!m) { return null; }
        return { token: { type: 'flag', value: m[1].toLowerCase() }, end: pos + m[1].length };
    }

    private recognizeShortcut(input: string, pos: number): RecognizerResult | null {
        const m = input.slice(pos).match(/^(today|tod|tomorrow|tom|yesterday|yes|heute|morgen|gestern|0)(?=\s|$)/i);
        if (!m) { return null; }
        return { token: { type: 'shortcut', value: m[1].toLowerCase() }, end: pos + m[1].length };
    }

    private recognizeOffset(input: string, pos: number): RecognizerResult | null {
        const m = input.slice(pos).match(/^([+-]\d+)(?=\s|$)/);
        if (!m) { return null; }
        return { token: { type: 'offset', value: m[1] }, end: pos + m[1].length };
    }

    private recognizeWeekNum(input: string, pos: number): RecognizerResult | null {
        const m = input.slice(pos).match(/^w(?:eek)?\s?(\d{1,2})(?=\s|$)/i);
        if (!m) { return null; }
        return { token: { type: 'weekNum', value: m[1] }, end: pos + m[0].length };
    }

    private recognizeWeek(input: string, pos: number): RecognizerResult | null {
        const m = input.slice(pos).match(/^w(?:eek)?(?=\s|$)/i);
        if (!m) { return null; }
        return { token: { type: 'week', value: m[0].toLowerCase() }, end: pos + m[0].length };
    }

    private recognizeModifier(input: string, pos: number): RecognizerResult | null {
        const m = input.slice(pos).match(/^(next|last|n|l)(?=\s|$)/i);
        if (!m) { return null; }
        return { token: { type: 'modifier', value: m[1].toLowerCase() }, end: pos + m[1].length };
    }

    private getWeekdayPatterns(): RegExp[] {
        if (!this._weekdayPatterns) {
            this._weekdayPatterns = this.weekdayVocab().map(e => new RegExp(`^(?:${e})(?=\\s|$)`, 'i'));
        }
        return this._weekdayPatterns;
    }

    private recognizeWeekday(input: string, pos: number): RecognizerResult | null {
        const sub = input.slice(pos);
        for (const re of this.getWeekdayPatterns()) {
            const m = sub.match(re);
            if (m) {
                return { token: { type: 'weekday', value: m[0].toLowerCase() }, end: pos + m[0].length, ambiguous: m[0].length <= 3 };
            }
        }
        return null;
    }

    private getMonthPatterns(): RegExp[] {
        if (!this._monthPatterns) {
            this._monthPatterns = this.monthVocab().map(e => new RegExp(`^(?:${e})(?=\\s|$)`, 'i'));
        }
        return this._monthPatterns;
    }

    private recognizeMonth(input: string, pos: number): RecognizerResult | null {
        const sub = input.slice(pos);
        for (const re of this.getMonthPatterns()) {
            const m = sub.match(re);
            if (m) {
                return { token: { type: 'month', value: m[0].toLowerCase() }, end: pos + m[0].length };
            }
        }
        return null;
    }

    private recognizeDayOfMonth(input: string, pos: number): RecognizerResult | null {
        const m = input.slice(pos).match(/^(\d{1,2})(?=\s|$)/);
        if (!m) { return null; }
        const d = parseInt(m[1]);
        if (d < 1 || d > 31) { return null; }
        return { token: { type: 'dayOfMonth', value: m[1] }, end: pos + m[1].length };
    }

    private recognizeISO(input: string, pos: number): RecognizerResult | null {
        const sub = input.slice(pos);
        const full = sub.match(/^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})(?=\s|$)/);
        if (full) { return { token: { type: 'iso', value: full[1] }, end: pos + full[1].length }; }
        const md = sub.match(/^(\d{1,2}[-\/]\d{1,2})(?=\s|$)/);
        if (md) { return { token: { type: 'iso', value: md[1] }, end: pos + md[1].length }; }
        const d = sub.match(/^(\d{1,2})(?=\s|$)/);
        if (d) { return { token: { type: 'iso', value: d[1] }, end: pos + d[1].length }; }
        return null;
    }

    private tokenize(inputString: string): TokenizeResult {
        const tokens: Token[] = [];
        let pos = this.skipWs(inputString, 0);
        let hasTemporal = false;
        let ambiguous = false;

        // pre-flag
        const preFlagR = this.recognizeFlag(inputString, pos);
        if (preFlagR) { tokens.push(preFlagR.token); pos = this.skipWs(inputString, preFlagR.end); }

        // temporal token
        let temporal: RecognizerResult | null = null;

        temporal = this.recognizeShortcut(inputString, pos);
        if (!temporal) { temporal = this.recognizeOffset(inputString, pos); }

        if (!temporal) {
            // weekNum before week (w23 vs w)
            temporal = this.recognizeWeekNum(inputString, pos);
        }

        if (!temporal) {
            // modifier + weekday/week/weekNum
            const modR = this.recognizeModifier(inputString, pos);
            if (modR) {
                const afterMod = this.skipWs(inputString, modR.end);
                const wdR = this.recognizeWeekday(inputString, afterMod);
                if (wdR) {
                    tokens.push(modR.token);
                    temporal = wdR;
                    if (wdR.ambiguous) { ambiguous = true; }
                } else {
                    const wnR = this.recognizeWeekNum(inputString, afterMod);
                    if (wnR) {
                        tokens.push(modR.token);
                        temporal = wnR;
                    } else {
                        const wkR = this.recognizeWeek(inputString, afterMod);
                        if (wkR) {
                            tokens.push(modR.token);
                            temporal = wkR;
                        }
                        // modifier without following week/weekday: don't consume — falls to text
                    }
                }
            }
        }

        if (!temporal) {
            // plain weekday (no modifier)
            const wdR = this.recognizeWeekday(inputString, pos);
            if (wdR) {
                temporal = wdR;
                if (wdR.ambiguous) { ambiguous = true; }
            }
        }

        if (!temporal) { temporal = this.recognizeISO(inputString, pos); }

        if (!temporal) {
            const wkR = this.recognizeWeek(inputString, pos);
            if (wkR) { temporal = wkR; }
        }

        if (!temporal) {
            // month + dayOfMonth pair
            const moR = this.recognizeMonth(inputString, pos);
            if (moR) {
                const afterMo = this.skipWs(inputString, moR.end);
                const domR = this.recognizeDayOfMonth(inputString, afterMo);
                if (domR) {
                    tokens.push(moR.token);
                    temporal = domR;
                    // store month token already pushed; dayOfMonth is temporal below
                    // Re-type the last push to 'month', temporal is 'dayOfMonth'
                }
                // month alone: don't consume — falls to text
            }
        }

        if (temporal) {
            tokens.push(temporal.token);
            pos = this.skipWs(inputString, temporal.end);
            hasTemporal = true;
        }

        // post-flag
        if (hasTemporal) {
            const postFlagR = this.recognizeFlag(inputString, pos);
            if (postFlagR) { tokens.push(postFlagR.token); pos = this.skipWs(inputString, postFlagR.end); }
        }

        // text remainder
        if (pos < inputString.length) {
            tokens.push({ type: 'text', value: inputString.slice(pos).trim() });
        }

        const confidence: ParseConfidence = hasTemporal
            ? (ambiguous ? 'ambiguous' : 'resolved')
            : 'text-only';

        return { tokens, confidence };
    }

    private tokensToInput(tokens: Token[]): Input {
        const result = new Input();

        const flagTok   = tokens.find(t => t.type === 'flag');
        const shortcut  = tokens.find(t => t.type === 'shortcut');
        const offsetTok = tokens.find(t => t.type === 'offset');
        const isoTok    = tokens.find(t => t.type === 'iso');
        const modTok    = tokens.find(t => t.type === 'modifier');
        const weekdayTk = tokens.find(t => t.type === 'weekday');
        const weekTok   = tokens.find(t => t.type === 'week');
        const weekNumTk = tokens.find(t => t.type === 'weekNum');
        const monthTok  = tokens.find(t => t.type === 'month');
        const domTok    = tokens.find(t => t.type === 'dayOfMonth');
        const textTok   = tokens.find(t => t.type === 'text');

        result.flags = flagTok ? flagTok.value : '';
        result.text  = textTok ? textTok.value.trim() : '';

        const hasTemporal = !!(shortcut || offsetTok || isoTok || weekdayTk || weekTok || weekNumTk || (monthTok && domTok));

        if (shortcut) {
            result.offset = this.resolveShortcutString(shortcut.value);
        } else if (offsetTok) {
            result.offset = this.resolveOffsetString(offsetTok.value);
        } else if (isoTok) {
            result.offset = this.resolveISOString(isoTok.value);
        } else if (weekdayTk) {
            result.offset = this.resolveWeekday(weekdayTk.value, modTok?.value);
        } else if (weekNumTk) {
            result.week   = parseInt(weekNumTk.value);
            result.offset = NaN;
        } else if (weekTok) {
            result.week   = this.resolveRelatedWeekNM(modTok?.value);
            result.offset = NaN;
        } else if (monthTok && domTok) {
            result.offset = this.resolveDayOfMonthNM(monthTok.value, domTok.value);
        }

        if (!hasTemporal) {
            if (this.granularity === 'weekly') {
                result.week   = getCurrentISOWeek(new Date());
                result.offset = NaN;
            } else {
                result.offset = 0;
            }
        }

        if (!result.hasFlags() && result.hasMemo()) {
            result.flags = 'memo';
        }
        if (result.hasFlags() && !result.hasMemo()) {
            throw new Error('No text found for memo or task');
        }

        return result;
    }

    private resolveRelatedWeekNM(modifier?: string): number {
        const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
        if (isNotNullOrUndefined(modifier) && modifier!.match(/^(l|last)$/i)) {
            return getCurrentISOWeek(new Date(Date.now() - MS_PER_WEEK));
        }
        if (isNotNullOrUndefined(modifier) && modifier!.match(/^(n|next)$/i)) {
            return getCurrentISOWeek(new Date(Date.now() + MS_PER_WEEK));
        }
        return getCurrentISOWeek(new Date());
    }

    private resolveDayOfMonthNM(month: string, dayOfMonth: string): number {
        const monthIdx  = getMonthForString(month);
        const day       = parseInt(dayOfMonth);
        const todayInMS = Date.UTC(this.today.getFullYear(), this.today.getMonth(), this.today.getDate());
        const targetInMS = Date.UTC(this.today.getFullYear(), monthIdx, day);
        return Math.floor((targetInMS - todayInMS) / (1000 * 60 * 60 * 24));
    }

    // Vocab arrays (replacing getWeekdayPattern / getMonthPattern as data sources).
    // Entries are regex-compatible strings, sorted longest-first within each locale.
    // The pattern cache (_weekdayPatterns / _monthPatterns) wraps each entry with
    // ^(?:entry)(?=\s|$) for the recognizer scan.

    private weekdayVocab(): string[] {
        return [
            // English
            'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
            'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
            // German
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
        ];
    }

    private monthVocab(): string[] {
        return [
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
        ];
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