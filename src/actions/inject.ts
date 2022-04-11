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
import * as J from '../.';




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
    public async injectInput(doc: vscode.TextDocument, input: J.Model.Input): Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering injectInput() in inject.ts with Input:", JSON.stringify(input));

        return new Promise<vscode.TextDocument>((resolve, reject) => {
            try {
                if (!input.hasMemo() || !input.hasFlags()) {
                    // this.ctrl.logger.error("Failed to identify flags in the input.")
                    resolve(doc);
                } else {
                    if (input.flags.match("memo")) {
                        this.ctrl.config.getMemoInlineTemplate()
                            .then((tplInfo: J.Model.InlineTemplate) => this.buildInlineString(doc, tplInfo, ["${input}", input.text]))
                            .then((val: J.Model.InlineString) => this.injectInlineString(val))
                            .then((doc: vscode.TextDocument | PromiseLike<vscode.TextDocument>) => resolve(doc))
                            .catch((err: any) => reject(err));

                    } else if (input.flags.match("task")) {
                        this.ctrl.config.getTaskInlineTemplate()
                            .then((tplInfo: J.Model.InlineTemplate) => this.buildInlineString(doc, tplInfo, ["${input}", input.text]))
                            .then((val: J.Model.InlineString) => this.injectInlineString(val))
                            .then((doc: vscode.TextDocument | PromiseLike<vscode.TextDocument>) => resolve(doc))
                            .catch((err: any) => reject(err));

                    } else if (input.flags.match("todo")) {
                        this.ctrl.config.getTaskInlineTemplate()
                            .then((tplInfo: J.Model.InlineTemplate) => this.buildInlineString(doc, tplInfo, ["${input}", input.text]))
                            .then((val: J.Model.InlineString) => this.injectInlineString(val))
                            .then((doc: vscode.TextDocument | PromiseLike<vscode.TextDocument>) => resolve(doc))
                            .catch((err: any) => reject(err));
                    } else {
                        reject("Failed to handle input");
                    }
                }
            } catch (error) {
                if (error instanceof Error) {
                    this.ctrl.logger.error(error.message);
                    reject(error);
                } else {
                    reject("Failed to save document");
                }
            }

        });
    }



    /**
     * Builds inline string from given input using the provided document. Computes range at the location configured in the Inline Template (the "after"-flag). If no after is present, 
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
    public async buildInlineString(doc: vscode.TextDocument, tpl: J.Model.InlineTemplate, ...values: string[][]): Promise<J.Model.InlineString> {

        return new Promise((resolve, reject) => {

            try {
                this.ctrl.logger.trace("Entering buildInlineString() in inject.ts with InlineTemplate: ", JSON.stringify(tpl), " and values ", JSON.stringify(values));

                // construct content to insert
                let content: string = tpl.value!;
                values.forEach((val: string[]) => {
                    content = content.replace(val[0], val[1]);
                });
                content = this.adjustLineBreak(tpl, content); 
                
                const position = this.computePositionForInput(doc, tpl);

                resolve({
                    position: position,
                    value: content,
                    document: doc
                });
            } catch (error) {
                reject(error);
            }

        });
    }

    public adjustLineBreak(tpl: J.Model.InlineTemplate, content: string): string {
        // if (tpl-after) is empty, we will inject directly after header
        if (tpl.after.length !== 0) {
            if (tpl.after.startsWith("#")) {
                // fix for #55, always place a linebreak for injected text in markdown
                content = '\n' + content;
            }
        } else {
            // fix for #55, always place a linebreak for injected text after the header
            content = '\n' + content;
        }
        return content; 
  }

    public computePositionForInput(doc: vscode.TextDocument, tpl: J.Model.InlineTemplate): vscode.Position {
          // if (tpl-after) is empty, we will inject directly after header
          let position: vscode.Position = new vscode.Position(1, 0);
          if (tpl.after.length !== 0) {
              let offset: number = doc.getText().indexOf(tpl.after);


              if (offset > 0) {
                  position = doc.validatePosition(doc.positionAt(offset));
                  position = position.translate(1);
              }
          } 
          return position; 
    }

    /**
     * Injects a string into the given position within the given document. 
     * 
     * @param doc the vscode document 
     * @param content the string which is to be injected
     * @param position the position where we inject the string
     */
    public async injectString(doc: vscode.TextDocument, content: string, position: vscode.Position): Promise<vscode.TextDocument> {
        return this.injectInlineString({ document: doc, position: position, value: content });
    }


    /**
     * Injects the string at the given position. 
     * 
     * @param content the @see InlineString to be injected
     * @param other additional InlineStrings
     * 
     */
    public async injectInlineString(content: J.Model.InlineString, ...other: J.Model.InlineString[]): Promise<vscode.TextDocument> {


        return new Promise((resolve, reject) => {
            this.ctrl.logger.trace("Entering injectInlineString() in inject.ts with string: ", content.value.trim());

            if (J.Util.isNullOrUndefined(content)) {
                this.ctrl.logger.error("Content is null");
                reject("Invalid call, no reference to document due to null content.");
                return;
            }


            try {

                let edit = new vscode.WorkspaceEdit();

                let modifiedContent = this.formatContent(content);

                edit.insert(modifiedContent.document.uri, modifiedContent.position, modifiedContent.value);

                if (!J.Util.isNullOrUndefined(other) && other.length > 0) {
                    other.forEach(additionalContent => {
                        edit.insert(additionalContent.document.uri, additionalContent.position, additionalContent.value);
                    });
                }

                if (J.Util.isNullOrUndefined(edit) || edit.size === 0) {
                    this.ctrl.logger.trace("No changes have been made to the document: ", content.document.fileName);
                    resolve(content.document);
                } else {
                    vscode.workspace.applyEdit(edit)
                        .then(applied => {
                            if (applied === true) {
                                resolve(content.document);
                            } else {
                                this.ctrl.logger.error("Failed inject inline string '", content.value, "'");
                                reject("Failed to applied edit");
                            }
                        }, rejected => {
                            this.ctrl.logger.error("Failed inject inline string, reason: ", rejected);
                        });
                }

            } catch (error) {
                this.ctrl.logger.error("Error while injecting a string.", error);
                reject(error);
            }

        });
    }

    private formatContent(content: J.Model.InlineString) {
        if (J.Util.isNullOrUndefined(content.position)) {
            content.position = new vscode.Position(1, 0);
        }

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

        return content;
    }

    /**
     * Injects the given string as header (first line of file)
     * 
     * @param {vscode.TextDocument} doc the input file
     * @param {string} content the string to be injected as header
     * @returns {Q.Promise<vscode.TextDocument>} the updated document
     * @memberOf Inject 
     */
    public async injectHeader(doc: vscode.TextDocument, content: string): Promise<vscode.TextDocument> {
        return this.injectString(doc, content, new vscode.Position(0, 0));
    }



    /**
     * Builds the content of newly created notes file using the (scoped) configuration and the user input. 
     *1
     * @param {J.Model.Input} input what the user has entered
     * @returns {Q.Promise<string>} the built content
     * @memberof Inject
     */
    public async formatNote(input: J.Model.Input): Promise<string> {
        this.ctrl.logger.trace("Entering formatNote() in inject.ts with input: ", JSON.stringify(input));
        const headerTemplate: J.Model.HeaderTemplate = await this.ctrl.config.getNotesTemplate(input.scope); 
        headerTemplate.value = headerTemplate.value!.replace('${input}', input.text);
        headerTemplate.value = headerTemplate.value!.replace('${tags}', input.tags.join(" ") + '\n');

        return headerTemplate.value!; 
    }






   

}