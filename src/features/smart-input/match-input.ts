import { Logger } from '../../shared/logging/logger';
import { isNullOrUndefined, isNotNullOrUndefined } from '../../shared';
import { Input, ParseConfidence } from '../../shared/model/input';
import { getCurrentISOWeek } from '../../shared/dates/dates';
import { matchMonth, matchWeekday } from './vocabulary';

export type EntryGranularity = "daily" | "weekly";

// ---------------------------------------------------------------------------
// Tokenizer types
// ---------------------------------------------------------------------------

type TokenType =
    | 'flag' | 'shortcut' | 'offset' | 'iso'
    | 'weekNum' | 'week' | 'modifier' | 'weekday'
    | 'month' | 'dayOfMonth' | 'text';

/** `number` is the weekday (ISO, 1 = Monday) or month (0 = January) the word stands for. */
interface Token { type: TokenType; value: string; number?: number; }

interface RecognizerResult { token: Token; end: number; ambiguous?: boolean; }

interface TokenizeResult { tokens: Token[]; confidence: ParseConfidence; }

/**
 * Feature responsible for parsing the user input and and extracting offset, flags and text.
 */
export class MatchInput {
    /** The day offsets are relative to; read from the clock once per parseInput(). */
    private today: Date = new Date();
    private scopeExpression: RegExp = /\s#\w+\s/;

    constructor(
        public logger: Logger,
        public locale: string,
        public granularity: EntryGranularity = "daily",
        private readonly clock: () => Date = () => new Date(),
    ) { }

    /**
         * Takes a string and separates the flag, date and text
         *
         * @param {string} inputString the value to be parsed
         * @param {boolean} replaceSpecialCharacters if special characters like the # have to be normalized (e.g. for file names)
         * @returns {Q.Promise<J.Model.Input>} the resolved input object
         * @memberof Parser
         */
    public async parseInput(inputString: string): Promise<Input> {
        // read per call, so that long-lived instances don't use a stale date (#170)
        this.today = this.clock();

        this.logger.trace("Entering parseInput() in features/InputMatcher.ts with input string '", inputString, "'");

        if (isNullOrUndefined(inputString)) {
            throw new Error("cancel");
        }

        try {
            const { tokens, confidence } = this.tokenize(inputString);
            const parsedInput = this.tokensToInput(tokens);
            parsedInput.tags = this.extractTags(inputString);
            parsedInput.confidence = confidence;

            this.logger.trace("Parsed input: ", JSON.stringify(parsedInput));
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
     * @param searchedDay the ISO weekday (1 = Monday … 7 = Sunday)
     * @param mod next or last 
     * @returns the offset to the current day as number
     */
    private resolveWeekday(searchedDay: number, mod?: string): number {
        // ISO numbering like searchedDay: getDay() counts Sunday as 0
        let currentDay: number = this.today.getDay() || 7;
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

    private recognizeWeekday(input: string, pos: number): RecognizerResult | null {
        const m = matchWeekday(input.slice(pos), this.locale);
        if (!m) { return null; }
        return { token: { type: 'weekday', value: m.text.toLowerCase(), number: m.value }, end: pos + m.text.length, ambiguous: m.text.length <= 3 };
    }

    private recognizeMonth(input: string, pos: number): RecognizerResult | null {
        const m = matchMonth(input.slice(pos), this.locale);
        if (!m) { return null; }
        return { token: { type: 'month', value: m.text.toLowerCase(), number: m.value }, end: pos + m.text.length };
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
            result.offset = this.resolveWeekday(weekdayTk.number!, modTok?.value);
        } else if (weekNumTk) {
            result.week   = parseInt(weekNumTk.value);
            result.offset = NaN;
        } else if (weekTok) {
            result.week   = this.resolveRelatedWeekNM(modTok?.value);
            result.offset = NaN;
        } else if (monthTok && domTok) {
            result.offset = this.resolveDayOfMonthNM(monthTok.number!, domTok.value);
        }

        if (!hasTemporal) {
            if (this.granularity === 'weekly') {
                result.week   = getCurrentISOWeek(this.today);
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
            return getCurrentISOWeek(new Date(this.today.getTime() - MS_PER_WEEK));
        }
        if (isNotNullOrUndefined(modifier) && modifier!.match(/^(n|next)$/i)) {
            return getCurrentISOWeek(new Date(this.today.getTime() + MS_PER_WEEK));
        }
        return getCurrentISOWeek(this.today);
    }

    private resolveDayOfMonthNM(monthIdx: number, dayOfMonth: string): number {
        const day       = parseInt(dayOfMonth);
        const todayInMS = Date.UTC(this.today.getFullYear(), this.today.getMonth(), this.today.getDate());
        const targetInMS = Date.UTC(this.today.getFullYear(), monthIdx, day);
        return Math.floor((targetInMS - todayInMS) / (1000 * 60 * 60 * 24));
    }
}
