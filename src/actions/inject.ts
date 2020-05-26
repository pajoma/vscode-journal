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

import * as Path from 'path';
import * as vscode from 'vscode';
import * as Q from 'q';
import * as J from '../.';
import { isNullOrUndefined } from 'util';
import { pathToFileURL } from 'url';

interface InlineString {
    position: vscode.Position;
    value: string;
    document: vscode.TextDocument;

}

export class Inject {

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
                if (!input.hasMemo() || !input.hasFlags()) {
                    // this.ctrl.logger.error("Failed to identify flags in the input.")
                    resolve(doc);
                } else {
                    if (input.flags.match("memo")) {
                        this.ctrl.config.getMemoInlineTemplate()
                            .then(tplInfo => this.buildInlineString(doc, tplInfo, ["${input}", input.text]))
                            .then((val: InlineString) => this.injectInlineString(val))
                            .then(doc => resolve(doc))
                            .catch((err) => reject(err));

                    } else if (input.flags.match("task")) {
                        this.ctrl.config.getTaskInlineTemplate()
                            .then(tplInfo => this.buildInlineString(doc, tplInfo, ["${input}", input.text]))
                            .then((val: InlineString) => this.injectInlineString(val))
                            .then(doc => resolve(doc))
                            .catch((err) => reject(err));

                    } else if (input.flags.match("todo")) {
                        this.ctrl.config.getTaskInlineTemplate()
                            .then(tplInfo => this.buildInlineString(doc, tplInfo, ["${input}", input.text]))
                            .then((val: InlineString) => this.injectInlineString(val))
                            .then(doc => resolve(doc))
                            .catch((err) => reject(err));
                    } else {
                        reject("Failed to handle input");
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
     * @param {number} multiple number of edits which are to be expected (with the same template) to collect and avoid concurrent edits
     * @returns {Q.Promise<vscode.TextDocument>}
     * @memberof Inject
     * 
     * Updates: Fix for  #55, always make sure there is a linebreak between the header and the injected text to stay markdown compliant
     */
    public buildInlineString(doc: vscode.TextDocument, tpl: J.Extension.InlineTemplate, ...values: string[][]): Q.Promise<InlineString> {
        this.ctrl.logger.trace("Entering buildInlineString() in inject.ts with InlineTemplate: ", JSON.stringify(tpl), " and values ", JSON.stringify(values));

        var deferred: Q.Deferred<InlineString> = Q.defer<InlineString>();
        Q.fcall(() => {
            // construct content to insert
            let content: string = tpl.value!;
            values.forEach((val: string[]) => {
                content = content.replace(val[0], val[1]);
            });

            // if (tpl-after) is empty, we will inject directly after header
            let position: vscode.Position = new vscode.Position(1, 0);
            if (tpl.after.length !== 0) {
                let offset: number = doc.getText().indexOf(tpl.after);


                if (tpl.after.startsWith("#")) {
                    // fix for #55, always place a linebreak for injected text in markdown
                    content = '\n' + content;
                }



                if (offset > 0) {
                    position = doc.validatePosition(doc.positionAt(offset));
                    position = position.translate(1);
                }
            } else {
                // fix for #55, always place a linebreak for injected text after the header
                content = '\n' + content;
            }

            deferred.resolve({
                position: position,
                value: content,
                document: doc
            });
        })
            .catch((error) => deferred.reject(error))
            .done();



        return deferred.promise;
    }

    /**
     * Injects a string into the given position within the given document. 
     * 
     * @param doc the vscode document 
     * @param content the string which is to be injected
     * @param position the position where we inject the string
     */
    public injectString(doc: vscode.TextDocument, content: string, position: vscode.Position): Q.Promise<vscode.TextDocument> {
        return this.injectInlineString({ document: doc, position: position, value: content });
    }


    /**
     * Injects the string at the given position. 
     * 
     * @param content the @see InlineString to be injected
     * @param other additional InlineStrings
     * 
     */
    public injectInlineString(content: InlineString, ...other: InlineString[]): Q.Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering injectInlineString() in inject.ts with string: ", content.value);

        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();
        if (isNullOrUndefined(content.position)) {
            content.position = new vscode.Position(1, 0);
        }

        let edit = new vscode.WorkspaceEdit();

        Q.fcall(() => {

            // if string to be injected at position zero, we assume a request for a new line (if requested line is occupied)
            let newLine: boolean = (content.position.character === 0);


            // if target line exceeds document length, we always inject at the end of the last line (position is adjusted accordingly)
            content.position = content.document.validatePosition(content.position);

            // shift (inject line break) if line is occupied 
            if ((newLine === true) && (!content.document.lineAt(content.position.line).isEmptyOrWhitespace)) {

                // if we are at end of the file we prefix another linebreak to make room
                let end: vscode.Position = content.document.lineAt(content.document.lineCount - 1).range.end;

                if (content.position.isAfterOrEqual(end)) {
                    content.value = '\n' + content.value;
                }

                content.value = content.value + '\n';
            }


            // if following line is a header, we insert another linebreak at the end of the string
            if ((newLine === true) && (content.document.lineCount > content.position.translate(1).line)) {
                if (content.document.lineAt(content.position.line + 1).text.search(/^#+\s+.*$/) >= 0) {
                    content.value = content.value + '\n';
                }
            }
        }).then(() => {
            let multiple: boolean = (!isNullOrUndefined(other) && other.length > 0);


            edit.insert(content.document.uri, content.position, content.value); // ! = not null assertion operator

            if (multiple == true) {
                other.forEach(content => {
                    edit.insert(content.document.uri, content.position, content.value + '\n');
                });
            }

            return edit;
        }).then((edit: vscode.WorkspaceEdit) => {
            if (isNullOrUndefined(edit)) {
                deferred.reject("No edits included");

            }
            // console.log(JSON.stringify(edit.entries));

            return vscode.workspace.applyEdit(edit);
        }).then(applied => {
            if (applied === true) {
                deferred.resolve(content.document);
            } else {
                deferred.reject("Failed to applied edit");
            }
        }).catch((err) => {
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
     *1
     * @param {J.Model.Input} input what the user has entered
     * @returns {Q.Promise<string>} the built content
     * @memberof Inject
     */
    public buildNoteContent(input: J.Model.Input): Q.Promise<string> {
        this.ctrl.logger.trace("Entering buildNoteContent() in inject.ts with input: ", JSON.stringify(input));

        return Q.Promise<string>((resolve, reject) => {

            // Fixme: add the tags inject them after header
            this.ctrl.config.getNotesTemplate(input.scope)
                .then((ft: J.Extension.HeaderTemplate) => {
                    ft.value = ft.value!.replace('${input}', input.text);
                    ft.value = ft.value!.replace('${tags}', input.tags.join(" ") + '\n');

                    resolve(ft.value)
                })
                .catch(error => reject(error))
                .done();
        });
    }




    /**
     * Injects a reference to a file associated with the given document. The reference location can be configured in the template (after-flag)
     * @param doc the document which we will inject into
     * @param file the referenced path 
     */
    public buildReference(doc: vscode.TextDocument, file: vscode.Uri): Q.Promise<InlineString> {
        return Q.Promise<InlineString>((resolve, reject) => {
            try {
                this.ctrl.logger.trace("Entering injectReference() in ext/inject.ts for document: ", doc.fileName, " and file ", file);

                this.ctrl.config.getFileLinkInlineTemplate()
                    .then(tpl => {
                        let path: Path.ParsedPath = Path.parse(file.fsPath);

                        let title = path.name.replace(/_/g, " ")
                        if (path.ext.substr(1, path.ext.length) !== this.ctrl.config.getFileExtension()) {
                            title = "(" + path.ext + ") " + title;
                        };

                        // resolve indirect paths
                        // let relativePathToReference = Path.relative(doc.uri.fsPath, file); 

                        return this.buildInlineString(
                            doc,
                            tpl,
                            ["${title}", title],
                            // TODO: reference might refer to other locations 
                            ["${link}", file.toString()]
                        )
                    }
                    )
                    .then(inlineString => resolve(inlineString))
                    .catch(error => {
                        this.ctrl.logger.error("Failed to inject reference. Reason: ", error);
                        reject(error);
                    })
                    .done();


            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Checks for the given text document if it contains references to notes (and if there are notes in the associated folders)
     * It compares the two lists and creates (or deletes) any missing links
     * 
     * @param doc 
     */
    public synchronizeReferencedFiles(doc: vscode.TextDocument, date: Date): Q.Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering synchronizeReferencedFiles() in inject.ts for date: ", date);

        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();




        this.ctrl.ui.saveDocument(doc)
            .then(() => {
                // we invoke the scan o f the notes directory in parallel
                return Q.all([
                    this.ctrl.reader.getReferencedFiles(doc),
                    this.ctrl.reader.getFilesInNotesFolder(doc, date)
                ]).catch(error => {throw error}); 
            })
            .then((results: vscode.Uri[][]) => {
                // for each file, check wether it is in the list of referenced files
                let referencedFiles: vscode.Uri[] = results[0];
                let foundFiles: vscode.Uri[] = results[1];
                let promises: Q.Promise<InlineString>[] = [];

                foundFiles.forEach((file, index, array) => {
                    let foundFile: vscode.Uri | undefined = referencedFiles.find(match => match.fsPath === file.fsPath);
                    if (isNullOrUndefined(foundFile)) {
                        this.ctrl.logger.debug("synchronizeReferencedFiles() - File link not present in entry: ", file);
                        // files.push(file); 
                        // we don't execute yet, just collect the promises
                        promises.push(this.buildReference(doc, file));

                    }
                });
                return promises;

                //console.log(JSON.stringify(results));
            })
            .then((promises) => {
                this.ctrl.logger.trace("synchronizeReferencedFiles() - Number of references to synchronize: ", promises.length);

                if (promises.length === 0) { deferred.resolve(doc); }

                // see https://github.com/kriskowal/q#sequences
                Q.all(promises)
                    .then((values: InlineString[]) => {
                        if (values.length > 1) {
                            values.slice(1);
                            return this.injectInlineString(values[0], ...values.splice(1));
                        } else {
                            return this.injectInlineString(values[0]);
                        }
                    })
                    .then((doc: vscode.TextDocument) =>
                        deferred.resolve(doc))
                    .catch(deferred.reject)
                    .done();

            })
            .catch((err: Error) => {
                let msg = 'Failed to synchronize page with notes folder. Reason: ' + JSON.stringify(err.message);
                this.ctrl.logger.error(msg);
                deferred.reject(err);
            })
            .done();

        return deferred.promise;
    }

}