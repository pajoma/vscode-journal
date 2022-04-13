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
import * as J from '../.';

/** 
 * Anything which modifies the text documents goes here. 
 * 
 */
export class Writer {


    constructor(public ctrl: J.Util.Ctrl) {
    }

    public async saveDocument(doc: vscode.TextDocument): Promise<vscode.TextDocument> {
        return new Promise<vscode.TextDocument>((resolve, reject) => {
            doc.save()
            .then(
                _success => resolve(doc),
                _error => reject(_error)
            );
        }); 
    }


    /**
     * Adds the given content at the start of text document
     */
    public async writeHeader(doc: vscode.TextDocument, content: string): Promise<vscode.TextDocument> {
        return this.ctrl.inject.injectString(doc, content, new vscode.Position(0, 0));
    }




    /**
     * Creates and saves a new file (with configured content) for a journal entry and returns the associated TextDocument
     *
     * @param {string} path
     * @param {Date} date
     * @returns {Promise<vscode.TextDocument>}
     * @memberof Writer
     */
    public async createEntryForPath(path: string, date: Date): Promise<vscode.TextDocument> {
        

        return new Promise<vscode.TextDocument>((resolve, reject) => {
            this.ctrl.logger.trace("Entering createEntryForPath() in ext/writer.ts for path: ", path);

            this.ctrl.config.getEntryTemplate(date)
                .then((tpl: J.Model.HeaderTemplate) => {

                    // TODO: make this configurable (for now we keep the format hardcorded)
                    // return J.Util.formatDate(date, tpl.template, this.ctrl.config.getLocale());
                    return tpl.value || ""; 
                })
                .then((content) => {
                    return this.ctrl.writer.createSaveLoadTextDocument(path, content);
                })
                .then((doc: vscode.TextDocument) => resolve(doc))
                .catch(() => reject(path));
        });
    }

    /**
     * Creates and saves a new file (with configured content) for a weekly entry and returns the associated TextDocument
     *
     * @param {string} path
     * @param {Number} week
     * @returns {Promise<vscode.TextDocument>}
     * @memberof Writer
     */
         public async createWeeklyForPath(path: string, week: Number): Promise<vscode.TextDocument> {
        

            return new Promise<vscode.TextDocument>((resolve, reject) => {
                this.ctrl.logger.trace("Entering createWeeklyForPath() in ext/writer.ts for path: ", path);
    
                this.ctrl.config.getWeeklyTemplate(week)
                    .then((tpl: J.Model.HeaderTemplate) => {
                        return tpl.value || ""; 
                    })
                    .then((content) => {
                        return this.ctrl.writer.createSaveLoadTextDocument(path, content);
                    })
                    .then((doc: vscode.TextDocument) => resolve(doc))
                    .catch(() => reject(path));
            });
        }

    /**
     * Creates a new file,  adds the given content, saves it and opens it. 
     * 
     * @param {string} path The path in of the new file
     * @param {string} content The preconfigured content of the new file
     * @returns {Promise<vscode.TextDocument>}  The new document associated with the file
     */
    public async createSaveLoadTextDocument(path: string, content: string): Promise<vscode.TextDocument> {

        return new Promise<vscode.TextDocument>((resolve, reject) => {
            this.ctrl.logger.trace("Entering createSaveLoadTextDocument() in ext/writer.ts for path: ", path);
            let uri: vscode.Uri = vscode.Uri.parse('untitled:' + path);

            this.ctrl.ui.openDocument(uri)
                .then((doc: vscode.TextDocument) => this.ctrl.inject.injectHeader(doc, content))
                .then((doc: vscode.TextDocument) => this.ctrl.ui.saveDocument(doc))
                .then((doc: vscode.TextDocument) => {
                    if (doc.isUntitled) {
                        // open it again, this time not as untitled (since it has been saved)
                        vscode.workspace.openTextDocument(vscode.Uri.file(path))
                            .then(doc => {
                                this.ctrl.logger.debug("Opened new file with name: ", doc.fileName); 
                                resolve(doc); 
                            }, onRejected => reject(onRejected)); 
                            

                    } else {
                        resolve(doc);
                    }
                },
                    failed=> {
                        this.ctrl.logger.error("Failed to create file: ", uri.toString(), " with reason: ", failed); 
                        reject(failed);
                    }
                )
                .catch(onRejected => {
                    reject(onRejected); 
                });
        }); 

        
       

    }

}