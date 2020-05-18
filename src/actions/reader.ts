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

import * as fs from 'fs';
import * as Path from 'path';
import * as Q from 'q';
import { isNull, isNullOrUndefined, deprecate } from 'util';
import * as vscode from 'vscode';
import * as J from '../';
import { ScopedTemplate, JournalPageType } from '../ext/conf';

export interface FileEntry {
    path: string;
    name: string;
    update_at: number;
    created_at: number;
    type: JournalPageType;
}

/** 
 * Anything which scans the files in the background goes here
 * 
 */
export class Reader {
    constructor(public ctrl: J.Util.Ctrl) {
    }

    private previousEntries: Array<FileEntry> = [];


    /**
     * Loads previous entries. 
     * 
     * Update: ignore threshold
     *
     * @returns {Q.Promise<[string]>}
     * @memberof Reader
     * @deprecated  aargh, why?
     */
    public getPreviouslyAccessedFiles(thresholdInMs: number, callback: Function, picker: any, type: JournalPageType) {
        this.ctrl.logger.trace("Entering getPreviousJournalFiles() in  actions/reader.ts");
        /*
        deferred.resolve(this.previousEntries.map((f: FileEntry) => {
            return f.path; 
        })); */

        // go into base directory, find all files changed within the last 40 days
        // for each file, check if it is an entry, a note or an attachement
        Q.fcall(() => {
            let base: string = this.ctrl.config.getBasePath();
            this.walkDir(base, thresholdInMs, (entry: FileEntry) => {
                if (this.previousEntries.findIndex(e => e.path.startsWith(entry.path)) == -1) {
                    this.inferType(entry);
                    this.previousEntries.push(entry);
                }

                // this adds the item to the quickpick list of vscode (the addItem Function)
                callback(entry, picker, type);

            });
        });
    }

    public getPreviouslyAccessedFilesSync(thresholdInMs: number) {
        this.ctrl.logger.trace("Entering getPreviousJournalFilesSync() in  actions/reader.ts");

        const deferred: Q.Deferred<Array<FileEntry>> = Q.defer<FileEntry[]>();


        deferred.resolve(this.previousEntries);

        // go into base directory, find all files changed within the last 40 days (see config)
        // for each file, check if it is an entry, a note or an attachement
        let base: string = this.ctrl.config.getBasePath();
        this.walkDirSync(base, thresholdInMs, (entry: FileEntry) => {
            if (this.previousEntries.findIndex(e => e.path.startsWith(entry.path)) == -1) {
                this.inferType(entry);
                this.previousEntries.push(entry);
            }
        });

        return deferred.promise;
    }

    /**
     * Tries to infer the file type from the path by matching against the configured patterns
     * @param entry 
     */
    inferType(entry: FileEntry) {
        const fileName = entry.path.substring(entry.path.lastIndexOf(Path.sep) + 1, entry.path.lastIndexOf('.'));

        if (!entry.path.endsWith(this.ctrl.config.getFileExtension())) {
            entry.type = JournalPageType.ATTACHEMENT; // any attachement
        } else

            // this is getting out of hand if we need to infer it by scanning the patterns from the settings.
            // We keep it simple: if the filename contains only digits and special chars, we assume it 
            // is a journal entry. Everything else is a journal note. 
            if (fileName.match(/^[\d|\-|_]+$/gm)) {
                entry.type = JournalPageType.ENTRY; // any entry
            } else {
                entry.type = JournalPageType.NOTE; // anything else is a note
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
    private async walkDir(dir: string, thresholdInMs: number, callback: Function) {
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
                        updated_at: stats.mtimeMs,
                        created_at: stats.ctime
                    });
                }
            });
        });
    }

    private async walkDirSync(dir: string, thresholdDateInMs: number, callback: Function) {
        fs.readdirSync(dir).forEach(f => {
            if(f.startsWith(".")) return; 

            let dirPath = Path.join(dir, f);
            let stats: fs.Stats = fs.statSync(dirPath);
            

            // if last access time after threshold and item is directory
            if ((stats.atimeMs > thresholdDateInMs) && (stats.isDirectory())) {
                this.walkDir(dirPath, thresholdDateInMs, callback);

            // if modified time after threshold and item is file
            } else if (stats.mtimeMs > thresholdDateInMs) {
                callback({
                    path: Path.join(dir, f),
                    name: f,
                    updated_at: stats.mtimeMs,
                    created_at: stats.ctime

                });
            } else {
                console.log("ignored "+f);
                
            }
        });
    }

    public async checkDirectory(d: Date, entries: string[]) {
        await this.ctrl.config.getNotesPathPattern(d)
            .then(f => {
                console.log(f.value, "for", d);
                return f.value!
            }).then(path => {
                console.log("Checking " + path);
                fs.readdir(path, (err, files: string[]) => {
                    if (err) return;
                    else {
                        console.log("Directory exists");

                        files.forEach(file => {
                            if (!entries.find(p => file.startsWith(p))) {
                                entries.push(file);
                            }
                        })
                    }
                });
            })
    }

    /**
     *  Returns a list of all local files referenced in the given document. 
     *
     * @param {vscode.TextDocument} doc the current journal entry 
     * @returns {Q.Promise<string[]>} an array with all references in  the current journal page
     * @memberof Reader
     */
    public getReferencedFiles(doc: vscode.TextDocument): Q.Promise<string[]> {
        this.ctrl.logger.trace("Entering getReferencedFiles() in actions/reader.ts for document: ", doc.fileName);

        return Q.Promise<string[]>((resolve, reject) => {
            try {
                let references: string[] = [];
                let day: string = J.Util.getFileInURI(doc.uri.toString());
                let regexp: RegExp = new RegExp("\\[.*\\]\\(\\.\\/" + day + "\\/(.*[^\\)])\\)", 'g');
                let match: RegExpExecArray | null;

                while (!isNull(match = regexp.exec(doc.getText()))) {
                    references.push(match![1]);
                }

                this.ctrl.logger.trace("getReferencedFiles() - Referenced files in document: ", references.length);
                resolve(references);
            } catch (error) {
                this.ctrl.logger.trace("getReferencedFiles() - Failed to find references in journal entry with path ", doc.fileName);
                reject(error);

            }
        });

    }

    /**
     * Returns a list of files sitting in the notes folder for the current document (has to be a journal page)
     *
     * @param {vscode.TextDocument} doc the current journal entry 
     * @returns {Q.Promise<string[]>} an array with all files sitting in the directory associated with the current journal page
     * @memberof Reader
     */
    public getFilesInNotesFolder(doc: vscode.TextDocument, date: Date): Q.Promise<string[]> {
        this.ctrl.logger.trace("Entering getFilesInNotesFolder() in actions/reader.ts for document: ", doc.fileName);

        return Q.Promise<string[]>((resolve, reject) => {

            try {
                let filePattern: string;

                // FIXME: scan note foldes of new configurations
                this.ctrl.configuration.getNotesFilePattern(date, "")
                    .then((_filePattern: ScopedTemplate) => {
                        filePattern = _filePattern.value!.substring(0, _filePattern.value!.lastIndexOf(".")); // exclude file extension, otherwise search does not work
                        return this.ctrl.configuration.getNotesPathPattern(date);
                    })
                    .then((pathPattern: ScopedTemplate) => {


                        // check if directory exists
                        fs.access(pathPattern.value!, (err: NodeJS.ErrnoException | null) => {
                            if (isNullOrUndefined(err)) {
                                // list all files in directory and put into array
                                fs.readdir(pathPattern.value!, (err: NodeJS.ErrnoException | null, files: string[]) => {

                                    if (!isNullOrUndefined(err)) { reject(err.message); }
                                    this.ctrl.logger.debug("Found ", files.length, " files in notes folder at path: ", JSON.stringify(pathPattern.value!));

                                    files = files
                                        .filter((name: string) => {
                                            // only include files which match the current template
                                            let a = name.includes(filePattern);
                                            return name.includes(filePattern);

                                        })
                                        .filter((name: string) => {
                                            // second filter, check if no temporary files are included
                                            return (!name.startsWith("~") || !name.startsWith("."));
                                        });

                                    resolve(files);
                                });
                            } else {
                                resolve([]);
                            }

                        });


                    });

                /*
            // get base directory of file
            let p: string = doc.uri.fsPath;
    
            // get filename, strip extension, set as notes getFilesInNotesFolder
            p = p.substring(0, p.lastIndexOf("."));
    
    */




            } catch (error) {
                this.ctrl.logger.error(error);
                reject("Failed to scan files in notes folder");
            }
        });
    }









    /**
     * Creates or loads a note 
     *
     * @param {string} path
     * @param {string} content
     * @returns {Q.Promise<vscode.TextDocument>}
     * @memberof Writer
     */
    public loadNote(path: string, content: string): Q.Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering loadNote() in  actions/reader.ts for path: ", path);

        return Q.Promise<vscode.TextDocument>((resolve, reject) => {
            // check if file exists already

            this.ctrl.ui.openDocument(path)
                .then((doc: vscode.TextDocument) => resolve(doc))
                .catch(error => {
                    this.ctrl.writer.createSaveLoadTextDocument(path, content)
                        .then((doc: vscode.TextDocument) => resolve(doc))
                        .catch(error => {
                            this.ctrl.logger.error(error);
                            reject("Failed to load note.");
                        })
                })
                .done();

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
    public loadEntryForInput(input: J.Model.Input): Q.Promise<vscode.TextDocument> {
        return Q.Promise<vscode.TextDocument>((resolve, reject) => {
            if (isNullOrUndefined(input.offset)) {
                reject("Not a valid value for offset");
                return;
            }

            this.ctrl.logger.trace("Entering loadEntryForInput() in actions/reader.ts and offset " + input.offset);


            this.ctrl.reader.loadEntryForDate(input.generateDate())
                .then(resolve)
                .catch(reject)
                .done();
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
    public loadEntryForDate(date: Date): Q.Promise<vscode.TextDocument> {

        return Q.Promise<vscode.TextDocument>((resolve, reject) => {
            if (isNullOrUndefined(date) || date.toString().includes("Invalid")) {
                reject("Invalid date");
                return;
            }

            this.ctrl.logger.trace("Entering loadEntryforDate() in actions/reader.ts for date " + date.toISOString());


            let path: string = "";

            Q.all([
                this.ctrl.config.getEntryPathPattern(date),
                this.ctrl.config.getEntryFilePattern(date)

            ]).then(([pathname, filename]) => {
                path = Path.resolve(pathname.value!, filename.value!);
                return this.ctrl.ui.openDocument(path);

            }).catch((error: Error) => {
                if (!error.message.startsWith("cannot open file:")) {
                    this.ctrl.logger.error(error);
                    reject(error);
                }
                return this.ctrl.writer.createEntryForPath(path, date);

            }).then((_doc: vscode.TextDocument) => {
                this.ctrl.logger.debug("loadEntryForDate() - Loaded file in:", _doc.uri.toString());
                return this.ctrl.inject.synchronizeReferencedFiles(_doc, date);

            }).then((_doc: vscode.TextDocument) => {
                resolve(_doc);

            }).catch((error: Error) => {
                this.ctrl.logger.error(error);
                reject("Failed to load entry for date: " + date.toDateString());

            }).done();



            /*
            J.Util.getEntryPathForDate(date, this.ctrl.config.getBasePath(), this.ctrl.config.getFileExtension())
                .then((_path: string) => {
                    path = _path;
                    return this.ctrl.ui.openDocument(path);
                })
                .catch((error: Error) => {
                    return this.ctrl.writer.createEntryForPath(path, date);
                })
                .then((_doc: vscode.TextDocument) => {
                    this.ctrl.logger.debug("Loaded file:", _doc.uri.toString());
    
                    return this.ctrl.inject.synchronizeReferencedFiles(_doc);
                })
                .then((_doc: vscode.TextDocument) => {
                    resolve(_doc);
                })
    
                .catch((error: Error) => {
                    this.ctrl.logger.error(error);
                    reject("Failed to load entry for date: " + date.toDateString());
                })
                .done();
                */

        });
    }

}


