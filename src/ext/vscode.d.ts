import * as vscode from 'vscode';
import * as J from './..';
import { JournalPageType } from './conf';
import { FileEntry } from '../actions/reader';
interface DecoratedQuickPickItem extends vscode.QuickPickItem {
    parsedInput?: J.Model.Input;
    replace?: boolean;
    path: string;
    pickItem?: JournalPageType;
    fileEntry?: FileEntry;
}
/**
 * Anything which extends Visual Studio Code goes here
 *
 */
export declare class VSCode {
    ctrl: J.Util.Ctrl;
    constructor(ctrl: J.Util.Ctrl);
    /**
     *
     */
    getUserInputWithValidation(): Promise<J.Model.Input>;
    private generateDescription;
    private generateDetail;
    /**
     * Callback function for filewalker to add an item to our quickpick list
     *
     * @param fe
     */
    addItem(fe: FileEntry, input: vscode.QuickPick<DecoratedQuickPickItem>, type: JournalPageType): void;
    /**
     *
     * @param type
     */
    pickItem(type: JournalPageType): Promise<J.Model.Input>;
    /**
     * Simple method to have Q Promise for vscode API call to get user input
     */
    getUserInput(tip: string): Promise<string>;
    saveDocument(textDocument: vscode.TextDocument): Promise<vscode.TextDocument>;
    openDocument(path: string | vscode.Uri): Promise<vscode.TextDocument>;
    /**
     * Shows the given document in Visual Studio Code
     *
     * @param {vscode.TextDocument} textDocument the document to show
     * @returns {vscode.TextEditor} the associated text editor
     * @memberOf VsCode
     */
    showDocument(textDocument: vscode.TextDocument): Promise<vscode.TextEditor>;
}
export {};
