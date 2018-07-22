
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
import * as Q from 'q';

/** 
 * Anything which modifies the text documents goes here. 
 * 
 */
export class Writer {


    constructor(public ctrl: J.Util.Ctrl) {
    }

    public saveDocument(doc: vscode.TextDocument): Q.Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering saveDocument() in actions/writer.ts");

        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();
        doc.save()
            .then(
                success => deferred.resolve(doc),
                error => deferred.reject(error)
            );

        return deferred.promise;
    }


    /**
     * Adds the given content at the start of text document
     */
    public writeHeader(doc: vscode.TextDocument, content: string): Q.Promise<vscode.TextDocument> {
        return this.ctrl.inject.injectString(doc, content, new vscode.Position(0, 0));
    }




    /**
     * Creates and saves a new file (with configured content) for a journal entry and returns the associated TextDocument
     *
     * @param {string} path
     * @param {Date} date
     * @returns {Q.Promise<vscode.TextDocument>}
     * @memberof Writer
     */
    public createEntryForPath(path: string, date: Date): Q.Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering createEntryForPath() in ext/writer.ts for path: ", path);

        return Q.Promise<vscode.TextDocument>((resolve, reject) => {
            this.ctrl.config.getEntryTemplate()
                .then((tpl: J.Extension.HeaderTemplate) => {

                    // support old configuration format pre 0.6
                    if (tpl.template.startsWith("# {content}")) { tpl.template = tpl.template.replace("{content}", "dddd, L"); }


                    // TODO: make this configurable (for now we keep the format hardcorded)
                    return J.Util.formatDate(date, tpl.template, this.ctrl.config.getLocale());
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
     * @returns {vscode.TextDocument}  The new document associated with the file
     */
    public createSaveLoadTextDocument(path: string, content: string): Q.Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering createSaveLoadTextDocument() in ext/writer.ts for path: ", path);

        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();

        // check if file already exists


        let uri: vscode.Uri = vscode.Uri.parse('untitled:' + path);
        
        this.ctrl.ui.openDocument(uri)
            .then((doc: vscode.TextDocument) => this.ctrl.inject.injectHeader(doc, content))
            .then((doc: vscode.TextDocument) => this.ctrl.ui.saveDocument(doc))
            .then((doc: vscode.TextDocument) => {
                if (doc.isUntitled) {
                    // open it again, this time not as untitled (since it has been saved)
                    vscode.workspace.openTextDocument(vscode.Uri.file(path))
                        .then(doc => {
                            this.ctrl.logger.debug("Created new file with name: ", doc.fileName); 
                            deferred.resolve(doc); 
                        }, onRejected => deferred.reject(onRejected)); 
                        

                } else {
                    deferred.resolve(doc);
                }
            },
                failed => {
                    this.ctrl.logger.error("Failed to create file: ", uri.toString(), " with reason: ", failed); 
                    deferred.reject(failed);
                }
            )
            .catch(onRejected => {
                deferred.reject(onRejected); 
            })
            .done(); 

        return deferred.promise;
    }



}