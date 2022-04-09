// Copyright (C) 2018  Patrick Maué
// 
// This file is part of vscode-journal.
// 
// vscode-journal is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// 
// vscode-journal is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
// 
// You should have received a copy of the GNU General Public License
// along with vscode-journal.  If not, see <http://www.gnu.org/licenses/>.
// 

'use strict';

import { rejects } from 'assert';
import * as fs from 'fs';
import * as Path from 'path';
import { resolve } from 'path';
import * as vscode from 'vscode';
import * as J from '../';
import { ConsoleLogger } from '../util/logger';

export interface FileEntry {
    path: string;
    name: string;
    scope: string;
    updateAt: number;
    createdAt: number;
    type: J.Model.JournalPageType;
}

export interface BaseDirectory {
    path: string;
    scope: string;
}

/** 
 * Anything which scans the files in the background goes here
 * 
 */

export class Reader {
    constructor(public ctrl: J.Util.Ctrl) {
    }

    //private previousEntries: Array<FileEntry> = [];


    /**
     * Loads previous entries. This method is async and is called in combination with the sync method (which uses the threshold)
     * 
     * Update: ignore threshold
     *
     * @returns {Q.Promise<[string]>}
     * @memberof Reader
     */
    public async getPreviouslyAccessedFiles(thresholdInMs: number, callback: Function, picker: any, type: J.Model.JournalPageType, directories: BaseDirectory[]): Promise<void> {

        /*
        deferred.resolve(this.previousEntries.map((f: FileEntry) => {
            return f.path; 
        })); */

        // go into base directory, find all files changed within the last 40 days
        // for each file, check if it is an entry, a note or an attachement


        this.ctrl.logger.trace("Entering getPreviousJournalFiles() in actions/reader.ts and directory: " + directories);
        directories.forEach(directory => {
            if (!fs.existsSync(directory.path)) {
                this.ctrl.logger.error("Invalid configuration, base directory does not exist");
                return;
            }

            this.walkDir(directory.path, thresholdInMs, (entry: FileEntry) => {

                entry.type = this.inferType(Path.parse(entry.path));
                entry.scope = directory.scope;
                // this adds the item to the quickpick list of vscode (the addItem Function)
                callback(entry, picker, type);
            });
        });
    }

    public getPreviouslyAccessedFilesSync(thresholdInMs: number, directories: BaseDirectory[]): Promise<FileEntry[]> {

        return new Promise<FileEntry[]>((resolve, reject) => {
            try {
                this.ctrl.logger.trace("Entering getPreviousJournalFilesSync() in actions/reader.ts");

                let result: FileEntry[] = [];

                // go into base directory, find all files changed within the last 40 days (see config)
                // for each file, check if it is an entry, a note or an attachement
                directories.forEach(directory => {
                    if (!fs.existsSync(directory.path)) {
                        this.ctrl.logger.error("Invalid configuration, base directory does not exist with path", directory.path);
                        return;
                    }

                    this.walkDirSync(directory.path, thresholdInMs, (entry: FileEntry) => {
                        /*if (this.previousEntries.findIndex(e => e.path.startsWith(entry.path)) == -1) {
                            this.inferType(entry);
                          //  this.previousEntries.push(entry);
                        }*/
                        entry.type = this.inferType(Path.parse(entry.path));
                        entry.scope = directory.scope;
                        result.push(entry);
                    });
                });
                resolve(result);
            } catch (error) {
                reject(error);
            }

        });


        /*
        
            */

    }

    /**
     * Tries to infer the file type from the path by matching against the configured patterns
     * @param entry 
     */
    inferType(entry: Path.ParsedPath): J.Model.JournalPageType {

        if (!entry.ext.endsWith(this.ctrl.config.getFileExtension())) {
            return J.Model.JournalPageType.attachement; // any attachement
        } else

            // this is getting out of hand if we need to infer it by scanning the patterns from the settings.
            // We keep it simple: if the filename contains only digits and special chars, we assume it 
            // is a journal entry. Everything else is a journal note. 
            if (entry.name.match(/^[\d|\-|_]+$/gm)) {
                return J.Model.JournalPageType.entry; // any entry
            } else {
                return J.Model.JournalPageType.note; // anything else is a note
            }


    }



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
    private async walkDir(dir: string, thresholdInMs: number, callback: Function): Promise<void> {
        fs.readdir(dir, (err, files) => {
            // we ignore errors here

            files.forEach(f => {
                let dirPath = Path.join(dir, f);
                let stats: fs.Stats = fs.statSync(dirPath);

                if (stats.isDirectory()) {
                    this.walkDir(dirPath, thresholdInMs, callback);
                } else {
                    callback({
                        path: Path.join(dir, f),
                        name: f,
                        updatedAt: stats.mtime,
                        accessedAt: stats.atime,
                        createdAt: stats.birthtime
                    });
                }
            });
        });
    }

    private async walkDirSync(dir: string, thresholdDateInMs: number, callback: Function): Promise<void> {
        fs.readdirSync(dir).forEach(f => {
            if (f.startsWith(".")) { return; }

            let dirPath = Path.join(dir, f);
            let stats: fs.Stats = fs.statSync(dirPath);

            // if last access time after threshold and item is directory
            if ((stats.atimeMs > thresholdDateInMs) && (stats.isDirectory())) {
                this.walkDirSync(dirPath, thresholdDateInMs, callback);

                // if modified time after threshold and item is file
            } else if (stats.mtimeMs > thresholdDateInMs) {

                callback({
                    path: Path.join(dir, f),
                    name: f,
                    updatedAt: stats.mtimeMs,
                    accessedAt: stats.atimeMs,
                    createdAt: stats.birthtimeMs

                });
            };
        });
    }

    public async checkDirectory(d: Date, entries: string[]): Promise<void> {
        await this.ctrl.config.getNotesPathPattern(d)
            .then(f => {
                console.log(f.value, "for", d);
                return f.value!;
            }).then(path => {
                console.log("Checking " + path);
                fs.readdir(path, (err, files: string[]) => {
                    if (err) { return; }
                    else {

                        files.forEach(file => {
                            if (!entries.find(p => file.startsWith(p))) {
                                entries.push(file);
                            }
                        });
                    }
                });
            });
    }





    /**
     * Creates or loads a note 
     *
     * @param {string} path
     * @param {string} content
     * @returns {Promise<vscode.TextDocument>}
     * @memberof Writer
     */
    public async loadNote(path: string, content: string): Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering loadNote() in  actions/reader.ts for path: ", path);

        return new Promise<vscode.TextDocument>((resolve, reject) => {
            // check if file exists already

            this.ctrl.ui.openDocument(path)
                .then((doc: vscode.TextDocument) => resolve(doc))
                .catch(error => {
                    this.ctrl.writer.createSaveLoadTextDocument(path, content)
                        .then((doc: vscode.TextDocument) => resolve(doc))
                        .catch(error => {
                            this.ctrl.logger.error(error);
                            reject("Failed to load note.");
                        });
                });

        });
    }

    /**
  * Returns the page for a day with the given input. If the page doesn't exist yet, 
  * it will be created (with the current date as header) 
  *
  * @param {input} input with offset 0 is today, -1 is yesterday
  * @returns {Q.Promise<vscode.TextDocument>} the document
  * @memberof Reader
  */
    public async loadEntryForInput(input: J.Model.Input): Promise<vscode.TextDocument> {

        if (input.hasOffset()) {
            return this.ctrl.reader.loadEntryForDay(input.generateDate());
        }
        if (input.hasWeek()) {
            return this.ctrl.reader.loadEntryForWeek(input.week);
        }
        throw Error("Neither offset nor week are defined in input, we abort.");

    }




    /**
     * Converts given path and filename into a full path. 
     * @param pathname 
     * @param filename 
     */
    private resolvePath(pathname: string, filename: string): string {

        return Path.resolve(pathname, filename);

    }


    /**
     * Loads the weekly page for the given week number (of the year)
     * @param week the week of the current year
     */
    loadEntryForWeek(week: Number): PromiseLike<vscode.TextDocument> {
        return new Promise<vscode.TextDocument>((resolve, reject) => {
            this.ctrl.logger.trace("Entering loadEntryForWeek() in actions/reader.ts for week " + week);

            let path: string = "";

            Promise.all([
                this.ctrl.config.getWeekPathPattern(week),
                this.ctrl.config.getWeekFilePattern(week)

            ]).then(([pathname, filename]) => {
                path = this.resolvePath(pathname.value!, filename.value!);
                return this.ctrl.ui.openDocument(path);

            }).catch((reason: any) => {
                if (reason instanceof Error) {
                    if (!reason.message.startsWith("cannot open file:")) {
                        this.ctrl.logger.printError(reason);
                        reject(reason);
                    }
                }
                return this.ctrl.writer.createWeeklyForPath(path, week);

            }).then((_doc: vscode.TextDocument) => {
                this.ctrl.logger.debug("loadEntryForWeek() - Loaded file in:", _doc.uri.toString());
                resolve(_doc);

            })
                .catch((error: Error) => {
                    this.ctrl.logger.printError(error);
                    reject("Failed to load entry for week: " + week);

                });
        });
    }


    /**
     * Loads the journal entry for the given date. If no entry exists, promise is rejected with the invalid path
     *
     * @param {Date} date the date for the entry
     * @returns {Q.Promise<vscode.TextDocument>} the document
     * @throws {string} error message
     * @memberof Reader
     */
    public async loadEntryForDay(date: Date): Promise<vscode.TextDocument> {

        return new Promise<vscode.TextDocument>((resolve, reject) => {
            if (J.Util.isNullOrUndefined(date) || date!.toString().includes("Invalid")) {
                reject("Invalid date");
                return;
            }

            this.ctrl.logger.trace("Entering loadEntryforDate() in actions/reader.ts for date " + date.toISOString());

            let path: string = "";

            Promise.all([
                this.ctrl.config.getEntryPathPattern(date),
                this.ctrl.config.getEntryFilePattern(date)

            ]).then(([pathname, filename]) => {
                path = this.resolvePath(pathname.value!, filename.value!);
                return this.ctrl.ui.openDocument(path);


            }).catch((reason: any) => {
                if (reason instanceof Error) {
                    if (!reason.message.startsWith("cannot open file:")) {
                        this.ctrl.logger.printError(reason);
                        reject(reason);
                    }
                }
                return this.ctrl.writer.createEntryForPath(path, date);

            }).then((_doc: vscode.TextDocument) => {
                this.ctrl.logger.debug("loadEntryForDate() - Loaded file in:", _doc.uri.toString());
                new J.Features.NoteLinksSync(this.ctrl).injectAttachementLinks(_doc, date)
                    .finally(() => 
                        // do nothing
                        this.ctrl.logger.trace("Scanning notes completed")
                    );
                resolve(_doc);

            }).catch((error: Error) => {
                this.ctrl.logger.printError(error);
                reject("Failed to load entry for date: " + date.toDateString());

            });

        });
    }

}


