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
import * as J from '../.'
import * as fs from 'fs'
import * as Q from 'q';

/** 
 * Anything which modifies the text documents goes here. 
 * 
 */
export class Writer {

    private cleanedUpFirstLine: boolean = false;

    constructor(public ctrl: J.Util.Ctrl) {
    }

    public saveDocument(doc: vscode.TextDocument): Q.Promise<vscode.TextDocument> {
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
     *
     *
     * @param {vscode.TextDocument} doc
     * @param {vscode.Position} pos
     * @param {J.Model.Input} input
     * @returns {Q.Promise<vscode.TextDocument>}
     * @memberof Writer
     */
    public writeInputToFile(doc: vscode.TextDocument, pos: vscode.Position, input: J.Model.Input): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();

        let content: string = "";
        if (input.flags.match("memo")) {
            this.ctrl.config.getMemoInlineTemplate()
                .then(tplInfo => {
                    let content = tplInfo.template.replace('${input}', input.text);
                    return this.ctrl.inject.injectString(doc, content, pos);
                }).then(deferred.resolve)
                .catch((err) => deferred.reject(err));

        } else if (input.flags.match("task")) {
            this.ctrl.config.getTaskInlineTemplate()
                .then(tplInfo => {
                    return this.ctrl.inject.injectInlineTemplate(doc, tplInfo, ["${input}", input.text]);
                }).then(deferred.resolve)
                .catch((err) => deferred.reject(err));

        } else if (input.flags.match("todo")) {
            this.ctrl.config.getTaskInlineTemplate()
                .then(tplInfo => {
                    return this.ctrl.inject.injectInlineTemplate(doc, tplInfo, ["${input}", input.text]);
                }).then(deferred.resolve)
                .catch((err) => deferred.reject(err));
        }

        return deferred.promise;
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
        return Q.Promise<vscode.TextDocument>((resolve, reject) => {
            this.ctrl.config.getEntryTemplate()
                .then((tpl: J.Extension.FileTemplate) => {
                    // format header of template
                    if(tpl.template.startsWith("# {content}")) tpl.template = tpl.template.replace("{content}", "dddd, L"); 


                    // TODO: make this configurable (for now we keep the format hardcorded)
                    return J.Util.formatDate(date, tpl.template, this.ctrl.config.getLocale())
                })
                .then((content) => {
                    return this.ctrl.writer.createSaveLoadTextDocument(path, content)
                })
                .then((doc: vscode.TextDocument) => resolve(doc))
                .catch(() => reject(path));
        });
    }

       /**
     * Creates a new file and adds the given content
     */
    public createSaveLoadTextDocument(path: string, content: string): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();



        let uri: vscode.Uri = vscode.Uri.parse('untitled:' + path);
        vscode.workspace.openTextDocument(uri)
            .then((doc: vscode.TextDocument) => this.ctrl.writer.writeHeader(doc, content))
            .then((doc: vscode.TextDocument) => {
                if (doc.isUntitled) {
                    // open it again, this time not as untitled (since it has been saved)
                    vscode.workspace.openTextDocument(vscode.Uri.file(path))
                        .then(deferred.resolve)
                } else {
                    deferred.resolve(doc);
                }

                // console.log('[Journal]', 'Created file: ', doc.uri.toString());
            },
                failed => {
                    console.error("[Journal] Failed to create file: ", uri.toString(), failed);
                    deferred.reject(failed);
                }
            );

        return deferred.promise;
    }



}