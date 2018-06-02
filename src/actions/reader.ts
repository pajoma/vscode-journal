// Copyright (C) 2016  Patrick Maué
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
import * as J from '../'
import * as fs from 'fs'
import * as Q from 'q';

/** 
 * Anything which scans the files in the background goes here
 * 
 */
export class Reader {
    constructor(public ctrl: J.Util.Ctrl) {
    }


    public getPreviousJournalFiles(): Q.Promise<[string]> {

        var deferred: Q.Deferred<[string]> = Q.defer<[string]>();

        let monthDir = J.Util.getPathOfMonth(new Date(), this.ctrl.config.getBasePath());
        let rexp = new RegExp("^\\d{2}\." + this.ctrl.config.getFileExtension());

        J.Util.debug("Reading files in", monthDir);

        let fileItems: [string] = <[string]>new Array();
        fs.readdir(monthDir, function (err, files: string[]) {
            if (err) deferred.reject(err);
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
                J.Util.debug("Found files in", monthDir, JSON.stringify(fileItems))
                deferred.resolve(fileItems);
            }
        });


        return deferred.promise;
    }


    /**
     * Returns a list of all local files referenced in the given document. 
     * @param doc 
     */
    public getReferencedFiles(doc: vscode.TextDocument): Q.Promise<string[]> {
        let deferred: Q.Deferred<string[]> = Q.defer<string[]>();
        let references: string[] = [];

        // type lineTuple = [string,string]; 

        Q.fcall(() => {
            let day: string = J.Util.getFileInURI(doc.uri.toString());
            let regexp: RegExp = new RegExp("\\[.*\\]\\(\\.\\/" + day + "\\/(.*[^\\)])\\)", 'g');
            let match: RegExpExecArray = null;
            while ((match = regexp.exec(doc.getText())) != null) {
                references.push(match[1]);
            }
            deferred.resolve(references);
        });

        return deferred.promise;
    }

    /**
     * Returns a list of files sitting in the notes folder for the current document (has to be a journal page)
     * @param doc 
     */
    public getFilesInNotesFolder(doc: vscode.TextDocument): Q.Promise<string[]> {
        let deferred: Q.Deferred<string[]> = Q.defer<string[]>();
        let references: string[] = [];

        // TODO: check wether this is a valid journal page

        Q.fcall(() => {

            // get base directory of file
            let p: string = doc.uri.fsPath;

            // get filename, strip extension, set as notes getFilesInNotesFolder
            p = p.substring(0, p.lastIndexOf("."));

            // list all files in directory and put into array
            fs.readdir(p, (err, files) => {
                if (err) {
                    deferred.resolve;
                } else {
                    deferred.resolve(files);
                }
                return;
            });

            // sa
            J.Util.debug("Found files in notes folder. ", JSON.stringify(p)); 
        });


        return deferred.promise;
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
        return Q.Promise<vscode.TextDocument>((resolve, reject) => {
            this.ctrl.reader.loadTextDocument(path)
                .then((doc: vscode.TextDocument) => resolve(doc))
                .catch((path: string) => {
                    if (path != "cancel") {
                        return this.ctrl.writer.createSaveLoadTextDocument(path, content);
                    } else {
                        throw "cancel";
                    }
                })
                .then((doc: vscode.TextDocument) => resolve(doc))
                .catch(error => reject(error));

        });
    };

     /**
     * Returns the page for a day with the given offset. If the page doesn't exist yet, 
     * it will be created (with the current date as header) 
     * @param {number} offset - 0 is today, -1 is yesterday
     */
    public loadEntryForOffset(offset: number): Q.Promise<vscode.TextDocument> {
        J.Util.trace("Entering loadEntryForOffset() in reader.ts")

        let deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();

        if (isNaN(offset)) deferred.reject("Journal: Not a valid value for offset");

        let date = new Date();
        date.setDate(date.getDate() + offset);

        this.ctrl.reader.loadEntryForDate(date)
            .then(deferred.resolve)
            .catch(deferred.reject)

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
        J.Util.trace("Entering loadEntryforDate() in reader.ts "); 


        return Q.Promise<vscode.TextDocument>((resolve, reject) => {
            J.Util.getEntryPathForDate(date, this.ctrl.config.getBasePath(), this.ctrl.config.getFileExtension())
                .then((path: string) => this.ctrl.reader.loadTextDocument(path))
                .catch(path => this.ctrl.writer.createEntryForPath(path, date))
                .then((doc: vscode.TextDocument) => {
                    J.Util.debug("Loaded file:", doc.uri.toString()); 

                    this.ctrl.inject.synchronizeReferencedFiles(doc);
                    resolve(doc)
                })
                .catch((error: Error) => {
                    J.Util.error("Failed to load entry for date. ", error.message, "\n", error.stack); 
                    reject(error)
                }
                )
                .done(); 
        });
    }


    /**
     * Loads a text document from the given path
     */
    private loadTextDocument(path: string): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();
        let uri = vscode.Uri.file(path);
        try {
            vscode.workspace.openTextDocument(uri).then(
                success => {
                    deferred.resolve(success)
                },
                failed => {
                    deferred.reject(path) // return path to reuse it later in createDoc     
                }
            );
        } catch (error) {
            deferred.reject(path);
        }


        return deferred.promise;
    }
}

