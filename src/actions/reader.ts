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

import * as vscode from 'vscode';
import * as J from '../';
import * as fs from 'fs';
import * as Q from 'q';
import { isNull, isNullOrUndefined } from 'util';


/** 
 * Anything which scans the files in the background goes here
 * 
 */
export class Reader {
    constructor(public ctrl: J.Util.Ctrl) {
    }

    /**
     * Loads previous journal entries. Dead code. 
     *
     * @returns {Q.Promise<[string]>}
     * @memberof Reader
     * @deprecated
     */
    public getPreviousJournalFiles(): Q.Promise<[string]> {
        this.ctrl.logger.trace("Entering getPreviousJournalFiles() in  actions/reader.ts");


        var deferred: Q.Deferred<[string]> = Q.defer<[string]>();

        let monthDir = J.Util.getPathOfMonth(new Date(), this.ctrl.config.getBasePath());
        let rexp = new RegExp("^\\d{2}\." + this.ctrl.config.getFileExtension());

        this.ctrl.logger.debug("Reading files in", monthDir);

        let fileItems: [string] = <[string]>new Array();
        fs.readdir(monthDir, function (err, files: string[]) {
            if (err) { deferred.reject(err); }
            else {
                for (var i = 0; i < files.length; i++) {
                    let match = files[i].match(rexp);
                    if (match && match.length > 0) {
                        fileItems.push(files[i]);
                        /*
                        let p = monthDir + files[i];                 
                         fs.stat(p, (err, stats) => {
                            if (stats.isFile()) {
                                fileItems.push(files[i]); 
                            }
                        }); */
                    }
                }

                // ctrl.logger.debug("Found files in", monthDir, JSON.stringify(fileItems));
                deferred.resolve(fileItems);
            }
        });


        return deferred.promise;
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

                this.ctrl.logger.debug("getReferencedFiles(): Referenced files in document: ", references.length);
                resolve(references);
            } catch (error) {
                this.ctrl.logger.error("getReferencedFiles(): Failed to find references in journal entry with path ",  doc.fileName);
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
    public getFilesInNotesFolder(doc: vscode.TextDocument): Q.Promise<string[]> {
        this.ctrl.logger.trace("Entering getFilesInNotesFolder() in actions/reader.ts for document: ", doc.fileName);

        return Q.Promise<string[]>((resolve, reject) => {

            try {
                // get base directory of file
                let p: string = doc.uri.fsPath;

                // get filename, strip extension, set as notes getFilesInNotesFolder
                p = p.substring(0, p.lastIndexOf("."));

                // check if directory exists
                fs.access(p, (err: NodeJS.ErrnoException) => {
                    if (isNullOrUndefined(err)) {
                        // list all files in directory and put into array
                        fs.readdir(p,  (err: NodeJS.ErrnoException, files: string[]) => {
                            if (!isNullOrUndefined(err)) reject(err.message);
                            this.ctrl.logger.debug("Found ", files.length, " files in notes folder at path: ", JSON.stringify(p));
                            resolve(files);
                        }); 
                    }  else {
                        resolve([]); 
                    }
                    
                } ); 






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
                    return this.ctrl.writer.createSaveLoadTextDocument(path, content);
                })
                .then((doc: vscode.TextDocument) => resolve(doc))
                .catch(error => {
                    this.ctrl.logger.error(error);
                    reject("Failed to load note.");
                })
                .done();

        });
    }


    /**
     * Returns the page for a day with the given offset. If the page doesn't exist yet, 
    * it will be created (with the current date as header) 
     *
     * @param {number} offset 0 is today, -1 is yesterday
     * @returns {Q.Promise<vscode.TextDocument>} the document
     * @memberof Reader
     */
    public loadEntryForOffset(offset: number): Q.Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering loadEntryForOffset() in actions/reader.ts");

        let deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();

        if (isNullOrUndefined(offset)) { deferred.reject("Not a valid value for offset"); }

        let date = new Date();
        date.setDate(date.getDate() + offset);

        this.ctrl.reader.loadEntryForDate(date)
            .then(deferred.resolve)
            .catch(deferred.reject)
            .done();

        return deferred.promise;
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
        this.ctrl.logger.trace("Entering loadEntryforDate() in actions/reader.ts ");


        return Q.Promise<vscode.TextDocument>((resolve, reject) => {
            J.Util.getEntryPathForDate(date, this.ctrl.config.getBasePath(), this.ctrl.config.getFileExtension())
                .then((path: string) => {
                    this.ctrl.ui.openDocument(path))
                        .then((doc: vscode.TextDocument) => {return doc}); 
                        
                        // TODO keine Lust mehr
                }
                    
                    
                    
                .catch(error => this.ctrl.writer.createEntryForPath(path, date))
                .then((doc: vscode.TextDocument) => {
                    this.ctrl.logger.debug("Loaded file:", doc.uri.toString());

                    this.ctrl.inject.synchronizeReferencedFiles(doc).then(doc => resolve(doc))
                })
                .catch((error: Error) => {
                    this.ctrl.logger.error(error);
                    reject("Failed to load entry for date: " + date.toDateString());
                }
                )
                .done();
        });
    }

}
 

