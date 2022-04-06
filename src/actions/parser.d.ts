import * as Q from 'q';
import * as J from '../.';
/**
 * Helper Methods to interpret the input strings
 */
export declare class Parser {
    ctrl: J.Util.Ctrl;
    today: Date;
    private expr;
    private scopeExpression;
    constructor(ctrl: J.Util.Ctrl);
    /**
     * Returns the file path for a given input. If the input includes a scope classifier ("#scope"), the path will be altered
     * accordingly (depending on the configuration of the scope).
     *
     * @param {string} input the input entered by the user
     * @returns {Q.Promise<string>} the path to the new file
     * @memberof JournalCommands
     *
     */
    resolveNotePathForInput(input: J.Model.Input, scopeId?: string): Promise<string>;
    parseNotesInput(input: string): Q.Promise<J.Model.Input>;
    /**
     * Takes a string and separates the flag, date and text
     *
     * @param {string} inputString the value to be parsed
     * @param {boolean} replaceSpecialCharacters if special characters like the # have to be normalized (e.g. for file names)
     * @returns {Q.Promise<J.Model.Input>} the resolved input object
     * @memberof Parser
     */
    parseInput(inputString: string): Promise<J.Model.Input>;
    /** PRIVATE FROM HERE **/
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
    resolveWeekday(weekday: string, mod?: string): number;
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
