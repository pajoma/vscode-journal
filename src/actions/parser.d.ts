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
    /**
     * Takes a string and separates the flag, date and text
     *
     * @param {string} inputString the value to be parsed
     * @returns {Promise<J.Model.Input>} the resolved input object
     * @memberof Parser
     */
    parseInput(inputString: string): Promise<J.Model.Input>;
}
