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
import * as J from '../.';
import { HeaderTemplate, InlineTemplate } from '../provider';


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
     * @returns {Promise<vscode.TextDocument>}
     * @memberof Inject
     */
    public async injectInput(doc: vscode.TextDocument, input: J.Model.Input): Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering injectInput() in inject.ts with Input:", JSON.stringify(input));

        try {
            let tplInfo: InlineTemplate;

            if(input.isMemo()) {
                tplInfo = await this.ctrl.config.getMemoInlineTemplate();
            } else if(input.isTask()) {
                tplInfo = await this.ctrl.config.getTaskInlineTemplate();
            } else {
                return doc; 
            }

            let tplString  = await this.buildInlineString(doc, tplInfo, ["${input}", input.text]);
            return this.injectInlineString(tplString); 
        } catch (error) {
            this.ctrl.logger.error("Error while injecting input.", error);
            throw error; 
        }
    }



    /**
     * Writes content at the location configured in the Inline Template (the "after"-flag). If no after is present, 
     * content will be injected after the header
     *
     * @param {vscode.TextDocument} doc
     * @param {J.Provider.InlineTemplate} tpl
     * @param {...string[][]} values
     * @param {number} multiple number of edits which are to be expected (with the same template) to collect and avoid concurrent edits
     * @returns {Q.Promise<vscode.TextDocument>}
     * @memberof Inject
     * 
     * Updates: Fix for  #55, always make sure there is a linebreak between the header and the injected text to stay markdown compliant
     */
    private async buildInlineString(doc: vscode.TextDocument, tpl: J.Provider.InlineTemplate, ...values: string[][]): Promise<InlineString> {
        this.ctrl.logger.trace("Entering buildInlineString() in inject.ts with InlineTemplate: ", JSON.stringify(tpl), " and values ", JSON.stringify(values));
        try {
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

            return {
                position: position,
                value: content,
                document: doc
            }; 
        } catch (error) {
            this.ctrl.logger.error("Error in buildInlineString() in inject.ts with InlineTemplate: ", JSON.stringify(tpl), " and values ", JSON.stringify(values), "Reason:", error);
            throw error; 
        }
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
    public async injectInlineString(content: InlineString, ...other: InlineString[]): Promise<vscode.TextDocument> {
        if(J.Util.isNullOrUndefined(content)) {
            this.ctrl.logger.error("Content is null");
            throw new Error("Invalid call, no reference to document due to null content.")
        }

        this.ctrl.logger.trace("Entering injectInlineString() in inject.ts with string: ", content.value);
        try {
    
            let edit = new vscode.WorkspaceEdit();
    
            let modifiedContent = this.formatContent(content);

            edit.insert(modifiedContent.document.uri, modifiedContent.position, modifiedContent.value); 

            if (!J.Util.isNullOrUndefined(other) && other.length > 0) {
                other.forEach(additionalContent => {
                    edit.insert(additionalContent.document.uri, additionalContent.position, additionalContent.value);
                });
            }

            if (J.Util.isNullOrUndefined(edit) || edit.size == 0) {
                this.ctrl.logger.trace("No changes have been made to the document: ", content.document.fileName);
                return content.document; 
            } else {
                if(await vscode.workspace.applyEdit(edit)) {
                    return(content.document);
                } else throw Error("Failed to applied edit"); 
            }

        } catch (error) {
            this.ctrl.logger.error("Error while injecting a string.", error);
            throw error; 
        }

    }

    private formatContent(content: InlineString) {
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
     * @returns {Thenable<vscode.TextDocument>} the updated document
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
        try {
            this.ctrl.logger.trace("Entering formatNote() in inject.ts with input: ", JSON.stringify(input));

            let headerTemplate: J.Provider.HeaderTemplate  = await this.ctrl.config.getNotesTemplate(input.scope);
            headerTemplate.value = headerTemplate.value!.replace('${input}', input.text);
            headerTemplate.value = headerTemplate.value!.replace('${tags}', input.tags.join(" ") + '\n');
            return headerTemplate.value; 
        } catch (error) {
            this.ctrl.logger.error("Error in formatNote() in inject.ts with input: ", JSON.stringify(input));
            throw error; 
        }
    }




    /**
     * Injects a reference to a file associated with the given document. The reference location can be configured in the template (after-flag)
     * @param doc the document which we will inject into
     * @param file the referenced path 
     */
    private async buildReference(doc: vscode.TextDocument, file: vscode.Uri): Promise<InlineString> {
        this.ctrl.logger.trace("Entering injectReference() in ext/inject.ts for document: ", doc.fileName, " and file ", file);

        try {
            let tpl: InlineTemplate = await this.ctrl.config.getFileLinkInlineTemplate(); 

            // fix for #70 
            const pathToLinkedFile: Path.ParsedPath = Path.parse(file.fsPath);
            const pathToEntry: Path.ParsedPath = Path.parse(doc.uri.fsPath); 
            const relativePath = Path.relative(pathToEntry.dir, pathToLinkedFile.dir); 
            const link = Path.join(relativePath, pathToLinkedFile.name+pathToLinkedFile.ext)

            let title = pathToLinkedFile.name.replace(/_/g, " ");
            if (pathToLinkedFile.ext.substr(1, pathToLinkedFile.ext.length) !== this.ctrl.config.getFileExtension()) {
                title = "(" + pathToLinkedFile.ext + ") " + title;
            };

            // TODO: reference might refer to other locations 
            return this.buildInlineString(doc, tpl, ["${title}", title], ["${link}", link]); 

        } catch (error) {
            this.ctrl.logger.error("Error in injectReference() in ext/inject.ts for document: ", doc.fileName, " and file ", file, "Reason: ", error);
            throw error; 
        }
    }

    /**
     * Checks for the given text document if it contains references to notes (and if there are notes in the associated folders)
     * It compares the two lists and creates (or deletes) any missing links
     * 
     * @param doc 
     */
    public async injectAttachementLinks(doc: vscode.TextDocument, date: Date): Promise<void> {
        this.ctrl.logger.trace("Entering injectAttachementLinks() in inject.ts for date: ", date);
        
        try {
            let savedDocument: vscode.TextDocument = await this.ctrl.ui.saveDocument(doc); 
        
            // FIXME: We have to change the logic here: first generate the link according to template, then check if the generated text is already in the document
    
            // we invoke the scan of the notes directory in parallel
            let referenceURIs: vscode.Uri[][] = await Promise.all([
                this.ctrl.reader.getReferencedFiles(savedDocument),
                this.ctrl.reader.getFilesInNotesFolderAllScopes(savedDocument, date)
            ]); 
    
                
            // for each file, check wether it is in the list of referenced files
            let referencedFiles: vscode.Uri[] = referenceURIs[0];
            let foundFiles: vscode.Uri[] = referenceURIs[1];
            let promises: Thenable<InlineString>[] = [];
            foundFiles.forEach((file, index, array) => {
                let foundFile: vscode.Uri | undefined = referencedFiles.find(match => match.fsPath === file.fsPath);
                if (J.Util.isNullOrUndefined(foundFile)) {
                    this.ctrl.logger.debug("injectAttachementLinks() - File link not present in entry: ", file);
                    // files.push(file); 
                    // we don't execute yet, just collect the promises
                    promises.push(this.buildReference(doc, file));
    
                }
            });
    
            const inlineStrings : InlineString[] = await Promise.all(promises); 
            this.ctrl.logger.trace("injectAttachementLinks() - Number of references to synchronize: ", inlineStrings.length);
    
            if (inlineStrings.length > 0) {
                this.injectInlineString(inlineStrings[0], ...inlineStrings.splice(1));
            } 

        } catch (error) {
            this.ctrl.logger.error("Failed to synchronize page with notes folder.", error);
            throw error; 
        }
    }

}