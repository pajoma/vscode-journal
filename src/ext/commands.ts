import { FileTemplate } from './conf';
import { Inject } from './../actions/inject';
// Copyright (C) 2017  Patrick Maué
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

export interface Commands {
    processInput(): Q.Promise<vscode.TextEditor>
    showNote(): Q.Promise<vscode.TextEditor>
    showEntry(offset: number): Q.Promise<vscode.TextEditor>
    loadJournalWorkspace(): Q.Promise<void>
    //editJournalConfiguration(): Thenable<vscode.TextEditor>
}


export class JournalCommands implements Commands {

    /**
     *
     */
    constructor(public ctrl: J.Util.Ctrl) {
    }
    /**
     * Opens the editor for a specific day. Supported values are explicit dates (in ISO format),
     * offsets (+ or - as prefix and 0) and weekdays (next wednesday) 
     */
    public processInput(): Q.Promise<vscode.TextEditor> {
        let deferred: Q.Deferred<vscode.TextEditor> = Q.defer<vscode.TextEditor>();
        let inputVar: J.Model.Input = null;
        let docVar: vscode.TextDocument = null;

        this.ctrl.ui.getUserInput("Enter day or memo (with flags) ")
            .then((inputString: string) => this.ctrl.parser.parseInput(inputString))
            .then((input: J.Model.Input) => this.loadPageForInput(input))
            .then(document => this.ctrl.ui.showDocument(document))
            .then((editor: vscode.TextEditor) => deferred.resolve(editor))
            .catch((error: any) => {
                if (error != 'cancel') {
                    J.Util.error("Failed to process input.");
                    deferred.reject(error);
                } 
                
            });
        return deferred.promise;
    }

    /**
     * Called by command 'Journal:open'. Opens a new windows with the Journal base directory as root. 
     *
     * @returns {Q.Promise<void>}
     * @memberof JournalCommands
     */
    public loadJournalWorkspace(): Q.Promise<void> {
        var deferred: Q.Deferred<void> = Q.defer<void>();

        let path = vscode.Uri.file(this.ctrl.config.getBasePath());
        vscode.commands.executeCommand('vscode.openFolder', path, true)
            .then(success => {
                deferred.resolve(null);
            },
                error => {
                    console.error("[Journal]", "Failed to open journal workspace.", error);
                    this.showError("Failed to open journal workspace.");
                    deferred.reject(error);
                });

        return deferred.promise;
    }

    

    /**
     * Returns the file path for a given input. If the input includes a scope classifier ("#scope"), the path will be altered 
     * accordingly (depending on the configuration of the scope). 
     *
     * @param {string} input the input entered by the user
     * @returns {Q.Promise<string>} the path to the new file
     * @memberof JournalCommands
     */
    private resolveNotePathForInput(input: J.Model.Input): Q.Promise<string> {
        return Q.Promise<string>((resolve, reject) => {
            let content: string = null;

    

            // Notes are always created in today's folder
            let date = new Date(); 


            // TODO: something here
            // this.ctrl.config.getNotesTemplate(scopeId).then((template: J.Extension.FileTemplate) =>
             J.Util.normalizeFilename(input.text)
                .then((filename: string) => {
                    return J.Util.getFilePathInDateFolder(date, 
                        filename, 
                        this.ctrl.config.getBasePath(input.scope), 
                        this.ctrl.config.getFileExtension(input.scope), 
                    )
                    
                })
                .then(path => resolve(path))
                .catch(error => reject(error))
                .done(); 
        });
    }

    private buildNoteContent(input: J.Model.Input): Q.Promise<string> {
        return Q.Promise<string>((resolve, reject) => {

            this.ctrl.config.getNotesTemplate(input.scope)
                .then((ft: FileTemplate) => resolve(ft.template.replace('${input}', input.text)))
                .catch(error => reject(error)) 
                .done(); 
        });
    }

    /**
     * Creates a new file in a subdirectory with the current day of the month as name.
     * Shows the file to let the user start adding notes right away.
     *
     * @returns {Q.Promise<vscode.TextEditor>}
     * @memberof JournalCommands
     */
    public showNote(): Q.Promise<vscode.TextEditor> {
        var deferred: Q.Deferred<vscode.TextEditor> = Q.defer<vscode.TextEditor>();

        this.ctrl.ui.getUserInput("Enter title for new note")
        .then((inputString: string) => this.ctrl.parser.parseInput(inputString))
        .then((input: J.Model.Input) =>
                Q.all([
                    this.resolveNotePathForInput(input),
                    this.buildNoteContent(input)
                ])
            )
            .then(([path, content]) => this.ctrl.reader.loadNote(path, content))
            .then((doc: vscode.TextDocument) => this.ctrl.ui.showDocument(doc))
            .then((editor: vscode.TextEditor) => deferred.resolve(editor))
            .catch(reason => {
                if (reason != 'cancel') {
                    console.error("[Journal]", "Failed to get file, Reason: ", reason);
                    this.showError("Failed to create and load notes");
                }
                deferred.reject(reason);
            })
            .done(); 

        return deferred.promise;
    }

    /**
     * Implements commands "yesterday", "today", "yesterday", where the input is predefined (no input box appears)
     * @param offset 
     */
    public showEntry(offset: number): Q.Promise<vscode.TextEditor> {
        var deferred: Q.Deferred<vscode.TextEditor> = Q.defer<vscode.TextEditor>();

        let input = new J.Model.Input(); 
        input.offset = offset; 

        this.loadPageForInput(input)
            .then((doc: vscode.TextDocument) => this.ctrl.ui.showDocument(doc))
            .then((editor: vscode.TextEditor) => deferred.resolve(editor))
            .catch((error: any) => {
                if (error != 'cancel') {
                    console.error("[Journal]", "Failed to get file, Reason: ", error);
                    
                }
                deferred.reject(error);
            })
            .done(); 

        return deferred.promise;
    }

    /*
    public editJournalConfiguration(): Q.Promise<vscode.TextEditor> {
        let deferred: Q.Deferred<vscode.TextEditor> = Q.defer<vscode.TextEditor>();
        this.ctrl.ui.pickConfigToEdit()
            .then(filepath => this.ctrl.VSCode.loadTextDocument(filepath))
            .then(document => this.ctrl.ui.showDocument(document))
            .then(editor => deferred.resolve(editor))
            .catch(error => {
                if (error != 'cancel') {
                    console.error("[Journal]", "Failed to get file, Reason: ", error);
                    this.showError("Failed to create and load notes");

                }
                deferred.reject(error);
            })

        return deferred.promise;
    } */


    public showError(error: string | Q.Promise<string>): void {
        (<Q.Promise<string>>error).then((value) => {
            // conflict between Q.IPromise and vscode.Thenable
            vscode.window.showErrorMessage(value);
        });
    }


    private loadPageForInput(input: J.Model.Input): Q.Promise<vscode.TextDocument> {
        J.Util.trace("Entering loadPageForInput() in commands.ts")


        let deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();

         this.ctrl.reader.loadEntryForOffset(input.offset)
            .then((doc: vscode.TextDocument) => this.ctrl.inject.injectInput(doc, input))
            .then((doc: vscode.TextDocument) => deferred.resolve(doc))
            .catch(error => deferred.reject(error))
            .done(); 


        return deferred.promise;
    }
}
