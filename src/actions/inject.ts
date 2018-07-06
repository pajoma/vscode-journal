// Copyright (C) 2018 Patrick Maué
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
import * as Q from 'q';
import * as J from '../.';
import { isNullOrUndefined } from 'util';

export class Inject {

    private cleanedUpFirstLine: boolean = false;

    constructor(public ctrl: J.Util.Ctrl) {

    }


    /**
     * Adds a new memo or task to today's page. A memo/task is a one liner (entered in input box), 
     * which can be used to quickly write down ToDos without leaving your current 
     * document.
     *
     * @param {vscode.TextDocument} doc
     * @param {J.Model.Input} input
     * @returns {Q.Promise<vscode.TextDocument>}
     * @memberof Inject
     */
    public injectInput(doc: vscode.TextDocument, input: J.Model.Input): Q.Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering injectInput() in inject.ts with Input:", JSON.stringify(input));

        return Q.Promise<vscode.TextDocument>((resolve, reject) => {
            try {
                if (!input.hasMemo() || !input.hasFlags()) { resolve(doc); }
                else {
                    if (input.flags.match("memo")) {
                        this.ctrl.config.getMemoInlineTemplate()
                            .then(tplInfo => {
                                return this.injectInlineTemplate(doc, tplInfo, ["${input}", input.text]);
                            }).then(doc => resolve(doc))
                            .catch((err) => reject(err));

                    } else if (input.flags.match("task")) {
                        this.ctrl.config.getTaskInlineTemplate()
                            .then(tplInfo => {
                                return this.injectInlineTemplate(doc, tplInfo, ["${input}", input.text]);
                            }).then(doc => resolve(doc))
                            .catch((err) => reject(err));

                    } else if (input.flags.match("todo")) {
                        this.ctrl.config.getTaskInlineTemplate()
                            .then(tplInfo => {
                                return this.injectInlineTemplate(doc, tplInfo, ["${input}", input.text]);
                            }).then(doc => resolve(doc))
                            .catch((err) => reject(err));
                    }
                }
            } catch (error) {
                this.ctrl.logger.error(error);
                reject(error);
            }

        });
    }


    /**
     * Writes content at the location configured in the Inline Template (the "after"-flag). If no after is present, 
     * content will be injected after the header
     *
     * @param {vscode.TextDocument} doc
     * @param {J.Extension.InlineTemplate} tpl
     * @param {...string[][]} values
     * @returns {Q.Promise<vscode.TextDocument>}
     * @memberof Inject
     */
    public injectInlineTemplate(doc: vscode.TextDocument, tpl: J.Extension.InlineTemplate, ...values: string[][]): Q.Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering injectInlineTemplate() in inject.ts with InlineTemplate: ", JSON.stringify(tpl), " and values ", JSON.stringify(values));

        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();
        Q.fcall(() => {
            // construct content to insert
            let content: string = tpl.template;
            values.forEach((val: string[]) => {
                content = content.replace(val[0], val[1]);
            });

            // if (tpl-after) is empty, we will inject directly after header
            let position: vscode.Position = new vscode.Position(0,0);
            if (tpl.after.length === 0) {
                return [content, position];
            } else {
                let offset: number = doc.getText().indexOf(tpl.after);

                // if after string is not found, we default to after header
                if (offset > 0) {
                    position = doc.validatePosition(doc.positionAt(offset).translate(2, 0));
                }
                return [content, position];

            }
        }).then(values => {
            return this.injectString(doc, <string>values[0], <vscode.Position>values[1]);

        })
        .then(() => deferred.resolve(doc) )
        .catch((error) => deferred.reject(error))
        .done(); 



        return deferred.promise;
    }

    /**
     * Injects the string at the given position. 
     * 
     */
    public injectString(doc: vscode.TextDocument, content: string, position?: vscode.Position): Q.Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering injectString() in inject.ts with string: ", content);

        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();
        if (isNullOrUndefined(position)) {
            position = new vscode.Position(2, 0);
        }

        Q.fcall(() => {
                // we want to have an empty line between after and content, if there's some content we need to shift a line
                if (!doc.lineAt(1).isEmptyOrWhitespace && !this.cleanedUpFirstLine) {
                    let edit = new vscode.WorkspaceEdit();
                    edit.insert(doc.uri, new vscode.Position(1, 0), '\n');
                    vscode.workspace.applyEdit(edit);
                    // flip toggle (we only want to have this once)
                    this.cleanedUpFirstLine = true;
                    }
                }
            )
            .then(() => {
                let edit = new vscode.WorkspaceEdit();
                // tslint:disable-next-line 
                edit.insert(doc.uri, position!, content); // ! = not null assertion operator
                return edit;
            })
            .then(vscode.workspace.applyEdit)
            .then(doc.save)
            .then((saved: boolean) => {
                this.cleanedUpFirstLine = false;
                if (saved) {deferred.resolve(doc);} 
                else {
                    deferred.reject("Failed to save file");
                }
            })
            .catch((err) => {
                this.ctrl.logger.error("Error while injecting a string.", err);
                deferred.reject(err);
            });

        return deferred.promise;
    }

    /**
     * Injects the given string as header (first line of file)
     * 
     * @param {vscode.TextDocument} doc the input file
     * @param {string} content the string to be injected as header
     * @returns {Q.Promise<vscode.TextDocument>} the updated document
     * @memberOf Inject 
     */
    public injectHeader(doc: vscode.TextDocument, content: string): Q.Promise<vscode.TextDocument> {
        return this.injectString(doc, content, new vscode.Position(0, 0));
    }


    /**
     * Builds the content of newly created notes file using the (scoped) configuration and the user input. 
     *
     * @param {J.Model.Input} input what the user has entered
     * @returns {Q.Promise<string>} the built content
     * @memberof Inject
     */
    public buildNoteContent(input: J.Model.Input): Q.Promise<string> {
        this.ctrl.logger.trace("Entering buildNoteContent() in inject.ts with input: ", JSON.stringify(input));

        return Q.Promise<string>((resolve, reject) => {

            this.ctrl.config.getNotesTemplate(input.scope)
                .then((ft: J.Extension.FileTemplate) => resolve(ft.template.replace('${input}', input.text)))
                .catch(error => reject(error))
                .done();
        });
    }


    /**
     * Injects a reference to a file associated with the given document. The reference location can be configured in the template (after-flag)
     * @param doc the document which we will inject into
     * @param file the referenced path 
     */
    public injectReference(doc: vscode.TextDocument, file: string): Q.Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering injectReference() in ext/inject.ts for document: ", doc.fileName, " and file ", file);

        return Q.Promise<vscode.TextDocument>((resolve, reject) => {

            this.ctrl.config.getFileLinkInlineTemplate()
                .then(tpl =>
                    this.injectInlineTemplate(
                        doc,
                        tpl,
                        ["${title}", J.Util.denormalizeFilename(file, this.ctrl.config.getFileExtension())],

                        // TODO: reference might refer to other locations 
                        ["${link}", "./" + J.Util.getFileInURI(doc.uri.path) + "/" + file]
                    )
                )
                .then(resultingDoc => resolve(resultingDoc))
                .catch(error => {
                    this.ctrl.logger.error("Failed to inject reference. Reason: ", error);
                    reject(error);
                })
                .done();

        });


    }

    public synchronizeReferencedFiles(doc: vscode.TextDocument): void {
        this.ctrl.logger.trace("Entering synchronizeReferencedFiles() in inject.ts for document: ", doc.fileName);

        // we invoke the scan of the notes directory in paralell
        Q.all([
            this.ctrl.reader.getReferencedFiles(doc),
            this.ctrl.reader.getFilesInNotesFolder(doc)
        ]).then((results: string[][]) => {
            // for each file, check wether it is in the list of referenced files
            let referencedFiles: string[] = results[0];
            let foundFiles: string[] = results[1];
            let promises: Q.Promise<vscode.TextDocument>[] = [];


            foundFiles.forEach((file, index, array) => {
                let m: string | undefined = referencedFiles.find(match => match === file);
                if (isNullOrUndefined(m)) {
                    this.ctrl.logger.debug("File link not present in entry: ", file);

                    // we don't execute yet, just collect the promises
                    promises.push(this.injectReference(doc, file));
                }
            });

            return promises;

            //console.log(JSON.stringify(results));
        })
            .then((promises) => {
                // see https://github.com/kriskowal/q#sequences
                return promises.reduce(Q.when);
            })
            .catch((err) => {
                let msg = 'Failed to synchronize page with notes folder. Reason: ' + err;
                this.ctrl.logger.error(msg);
            });
    }

}