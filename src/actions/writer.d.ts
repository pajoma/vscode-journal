import * as vscode from 'vscode';
import * as J from '../.';
import * as Q from 'q';
/**
 * Anything which modifies the text documents goes here.
 *
 */
export declare class Writer {
    ctrl: J.Util.Ctrl;
    constructor(ctrl: J.Util.Ctrl);
    saveDocument(doc: vscode.TextDocument): Q.Promise<vscode.TextDocument>;
    /**
     * Adds the given content at the start of text document
     */
    writeHeader(doc: vscode.TextDocument, content: string): Q.Promise<vscode.TextDocument>;
    /**
     * Creates and saves a new file (with configured content) for a journal entry and returns the associated TextDocument
     *
     * @param {string} path
     * @param {Date} date
     * @returns {Q.Promise<vscode.TextDocument>}
     * @memberof Writer
     */
    createEntryForPath(path: string, date: Date): Q.Promise<vscode.TextDocument>;
    /**
     * Creates a new file,  adds the given content, saves it and opens it.
     *
     * @param {string} path The path in of the new file
     * @param {string} content The preconfigured content of the new file
     * @returns {vscode.TextDocument}  The new document associated with the file
     */
    createSaveLoadTextDocument(path: string, content: string): Q.Promise<vscode.TextDocument>;
}
