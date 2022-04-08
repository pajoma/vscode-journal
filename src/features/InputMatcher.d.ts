import { Logger } from "../util/logger";
import { Input } from "../model/input";
export declare class InputMatcher {
    logger: Logger;
    today: Date;
    private scopeExpression;
    private expr;
    constructor(logger: Logger);
    /**
         * Takes a string and separates the flag, date and text
         *
         * @param {string} inputString the value to be parsed
         * @param {boolean} replaceSpecialCharacters if special characters like the # have to be normalized (e.g. for file names)
         * @returns {Q.Promise<J.Model.Input>} the resolved input object
         * @memberof Parser
         */
    parseInput(inputString: string): Promise<Input>;
    /**
     * If tags are present in the input string, extract them if these are configured scopes
     *
     * @private
     * @param {string[]} values
     * @returns {string}
     * @memberof Parser
     */
    private extractTags;
    private extractText;
    private extractFlags;
    private extractOffset;
    private resolveOffsetString;
    private resolveShortcutString;
    /**
     * Resolves an ISO String and returns the offset to the current day
     *
     * @param inputString  a date formatted as iso string, e.g. 06-22
     * @returns the offset to the current day
     */
    private resolveISOString;
    /**
     * Resolves the weekday for a given string. Allowed strings are monday to friday. If a modifier is present
     * ("next" or "last"), it will return the according weekdey of last or next week.
     *
     * @param weekday the weekday as a string
     * @param mod next or last
     * @returns the offset to the current day as number
     */
    private resolveWeekday;
    /**
     * Takes any given string as input and tries to compute the offset from today's date.
     * It translates something like "next wednesday" into "4" (if next wednesday is in four days).
     *
     * @param {string} value the string to be processed
     * @returns {Q.Promise<number>}  the resolved offeset
     * @memberof Parser
     */
    private getExpression;
}
