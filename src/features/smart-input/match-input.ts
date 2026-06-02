import { Logger } from '../../shared/logging/logger';
import { isNullOrUndefined, isNotNullOrUndefined, getDayOfWeekForString } from '../../shared';
import { Input, ParseConfidence } from '../../shared/model/input';
import { getMonthForString, getCurrentISOWeek } from '../../shared/dates/dates';

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

    private primaryLocale(): string {
        return this.locale.toLowerCase().split(/[-_]/)[0];
    }

    private weekdayVocab(): string[] {
        const english = [
            'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
            'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
        ];
        const byLocale: Record<string, string[]> = {
            'de': [
                'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag',
                'mon', 'die', 'mit', 'don', 'fre', 'sam', 'son',
            ],
            'fr': [
                'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche',
                'lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim',
            ],
            'es': [
                'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo',
                'lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom',
            ],
            'it': [
                'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica',
                'lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom',
            ],
            'pt': [
                'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo',
                'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom',
            ],
            'nl': [
                'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag',
                'maa', 'din', 'woe', 'don', 'vri', 'zat', 'zon',
            ],
            'ru': [
                'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье',
                'пон', 'вто', 'сре', 'чет', 'пят', 'суб', 'вос',
            ],
            'zh': [
                'xīngqī yī', 'xīngqī èr', 'xīngqī sān', 'xīngqī sì', 'xīngqī wǔ', 'xīngqī liù', 'xīngqī rì',
            ],
            'ja': [
                'getsuyōbi', 'kayōbi', 'suiyōbi', 'mokuyōbi', "kin'yōbi", 'doyōbi', 'nichiyōbi',
            ],
            'ar': [
                'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد',
            ],
        };
        return [...english, ...(byLocale[this.primaryLocale()] ?? [])];
    }

    private monthVocab(): string[] {
        const english = [
            'Jan(?:uary)?', 'Feb(?:ruary)?', 'Mar(?:ch)?', 'Apr(?:il)?', 'May', 'June?', 'July?',
            'Aug(?:ust)?', 'Sep(?:tember)?', 'Oct(?:ober)?', 'Nov(?:ember)?', 'Dec(?:ember)?',
        ];
        const byLocale: Record<string, string[]> = {
            'de': [
                'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
                'Okt(?:ober)?', 'Dez(?:ember)?',
            ],
            'fr': [
                'Janv(?:ier)?', 'Fév(?:rier)?', 'Mars', 'Avr(?:il)?', 'Juin', 'Juil(?:let)?',
                'Août', 'Sept(?:embre)?', 'Oct(?:obre)?', 'Nov(?:embre)?', 'Déc(?:embre)?',
            ],
            'es': [
                'Ene(?:ro)?', 'Feb(?:rero)?', 'Mar(?:zo)?', 'Abr(?:il)?', 'May(?:o)?',
                'Jun(?:io)?', 'Jul(?:io)?', 'Ago(?:sto)?', 'Sep(?:tiembre)?',
                'Oct(?:ubre)?', 'Nov(?:iembre)?', 'Dic(?:iembre)?',
            ],
            'it': [
                'Gen(?:naio)?', 'Feb(?:braio)?', 'Mag(?:gio)?', 'Giu(?:gno)?', 'Lug(?:lio)?',
                'Set(?:tembre)?', 'Ott(?:obre)?', 'Dic(?:embre)?',
            ],
            'pt': [
                'Jan(?:eiro)?', 'Fev(?:ereiro)?', 'Mar(?:ço)?', 'Mai(?:o)?', 'Jun(?:ho)?',
                'Jul(?:ho)?', 'Set(?:embro)?', 'Out(?:ubro)?', 'Nov(?:embro)?', 'Dez(?:embro)?',
            ],
            'nl': [
                'Jan(?:uari)?', 'Feb(?:ruari)?', 'Mrt', 'Mei', 'Jun(?:i)?', 'Jul(?:i)?', 'Aug(?:ustus)?',
            ],
            'ru': [
                'Янв(?:арь)?', 'Фев(?:раль)?', 'Мар(?:т)?', 'Апр(?:ель)?', 'Май',
                'Июн(?:ь)?', 'Июл(?:ь)?', 'Авг(?:уст)?', 'Сен(?:тябрь)?',
                'Окт(?:ябрь)?', 'Ноя(?:брь)?', 'Дек(?:абрь)?',
            ],
            'zh': [
                'yīyuè', 'èryuè', 'sānyuè', 'sìyuè', 'wǔyuè', 'liùyuè',
                'qīyuè', 'bāyuè', 'jiǔyuè', 'shíyuè', 'shíyīyuè', "shí'èryuè",
            ],
            'ja': [
                'ichigatsu', 'nigatsu', 'sangatsu', 'shigatsu', 'gogatsu', 'rokugatsu',
                'shichigatsu', 'hachigatsu', 'kugatsu', 'jugatsu', 'juichigatsu', 'juunigatsu',
            ],
            'ar': [
                'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو',
                'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
            ],
        };
        return [...english, ...(byLocale[this.primaryLocale()] ?? [])];
    }
}
