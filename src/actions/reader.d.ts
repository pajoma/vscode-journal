/// <reference types="node" />
import * as Path from 'path';
import * as vscode from 'vscode';
import * as J from '../';
import { JournalPageType } from '../ext/conf';
export interface FileEntry {
    path: string;
    name: string;
    scope: string;
    updateAt: number;
    createdAt: number;
    type: JournalPageType;
}
export interface BaseDirectory {
    path: string;
    scope: string;
}
/**
 * Anything which scans the files in the background goes here
 *
 */
export declare class Reader {
    ctrl: J.Util.Ctrl;
    constructor(ctrl: J.Util.Ctrl);
    /**
     * Loads previous entries. This method is async and is called in combination with the sync method (which uses the threshold)
     *
     * Update: ignore threshold
     *
     * @returns {Q.Promise<[string]>}
     * @memberof Reader
     */
    getPreviouslyAccessedFiles(thresholdInMs: number, callback: Function, picker: any, type: JournalPageType, directories: BaseDirectory[]): Promise<void>;
    getPreviouslyAccessedFilesSync(thresholdInMs: number, directories: BaseDirectory[]): Promise<FileEntry[]>;
    /**
     * Tries to infer the file type from the path by matching against the configured patterns
     * @param entry
     */
    inferType(entry: Path.ParsedPath): JournalPageType;
    /**
     * Scans journal directory and scans for notes
     *
     * Update: Removed age threshold, take everything
     * Update: switched to async with readdir
     *
     * See https://medium.com/@allenhwkim/nodejs-walk-directory-f30a2d8f038f
     * @param dir
     * @param callback
     */
    private walkDir;
    private walkDirSync;
    checkDirectory(d: Date, entries: string[]): Promise<void>;
    /**
     *  Returns a list of all local files referenced in the given document.
     *
     * @param {vscode.TextDocument} doc the current journal entry
     * @returns {Q.Promise<string[]>} an array with all references in  the current journal page
     * @memberof Reader
     */
    getReferencedFiles(doc: vscode.TextDocument): Promise<vscode.Uri[]>;
    getFilesInNotesFolderAllScopes(doc: vscode.TextDocument, date: Date): Promise<vscode.Uri[]>;
    /**
     * Returns a list of files sitting in the notes folder for the current document (has to be a journal page)
     *
     * By making the notes folder configurable, we cannot differentiate anymore by path. We always find (and inject all notes). We therefore also check the last modification date of the file itself
     *
     * @param {vscode.TextDocument} doc the current journal entry
     * @returns {Q.Promise<ParsedPath[]>} an array with all files sitting in the directory associated with the current journal page
     * @memberof Reader
     */
    getFilesInNotesFolder(doc: vscode.TextDocument, date: Date, scope: string): Promise<vscode.Uri[]>;
    /**
     * Creates or loads a note
     *
     * @param {string} path
     * @param {string} content
     * @returns {Promise<vscode.TextDocument>}
     * @memberof Writer
     */
    loadNote(path: string, content: string): Promise<vscode.TextDocument>;
    /**
  * Returns the page for a day with the given input. If the page doesn't exist yet,
  * it will be created (with the current date as header)
  *
  * @param {input} input with offset 0 is today, -1 is yesterday
  * @returns {Q.Promise<vscode.TextDocument>} the document
  * @memberof Reader
  */
    loadEntryForInput(input: J.Model.Input): Promise<vscode.TextDocument>;
    /**
     * Converts given path and filename into a full path.
     * @param pathname
     * @param filename
     */
    private resolvePath;
    /**
     * Loads the journal entry for the given date. If no entry exists, promise is rejected with the invalid path
     *
     * @param {Date} date the date for the entry
     * @returns {Q.Promise<vscode.TextDocument>} the document
     * @throws {string} error message
     * @memberof Reader
     */
    loadEntryForDate(date: Date): Promise<vscode.TextDocument>;
}
