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
import * as J from '../.';
import { SelectedInput, NoteInput } from '../model/input';

export interface Commands {
    processInput(): Promise<vscode.TextEditor | void>;
    showNote(): Promise<vscode.TextEditor | void>;
    showEntry(offset: number): Promise<vscode.TextEditor | void>;
    loadJournalWorkspace(): Promise<void>;
    printSum(): Promise<string>;
    printDuration(): Promise<string>;
    printTime(): Promise<string>;
    runTestFeature(): Promise<string>;

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
     * 
     * Update: supports much more now
     */
    public async processInput(): Promise<vscode.TextEditor | void> {


        this.ctrl.logger.trace("Entering processInput() in ext/commands.ts");

        return this.ctrl.ui.getUserInputWithValidation()
            .then((input: J.Model.Input) => this.loadPageForInput(input))
            .then((document: vscode.TextDocument) => this.ctrl.ui.showDocument(document))
            .catch((error: any) => {
                if (error !== 'cancel') {
                    this.ctrl.logger.error("Failed to process input.", error);
                    throw error;
                } else {
                    return Promise.resolve(null);
                }
            })
            .then(undefined, console.error);
    }

    /**
     * Called by command 'Journal:open'. Opens a new windows with the Journal base directory as root. 
     *
     * @returns {Q.Promise<void>}
     * @memberof JournalCommands
     */
    public async loadJournalWorkspace(): Promise<void> {


        return new Promise<void>((resolve, reject) => {
            this.ctrl.logger.trace("Entering loadJournalWorkspace() in ext/commands.ts");

            let path = vscode.Uri.file(this.ctrl.config.getBasePath());

            vscode.commands.executeCommand('vscode.openFolder', path, true)
                .then(_success => resolve(),
                    error => {
                        this.ctrl.logger.error("Failed to open journal workspace.", error);
                        reject("Failed to open journal workspace.");
                    });
        });


    }



    /**
     * Prints the sum of the selected numbers in the current editor at the selection location
     */
    public printSum(): Promise<string> {
        return new J.Features.TimeTrackerTools(this.ctrl).printSum(); 
        
    }

    /**
     * Prints the current time at the cursor postion
     *
     * @returns {Q.Promise<void>}
     * @memberof JournalCommands
     */
    public printTime(): Promise<string> {
        return new J.Features.TimeTrackerTools(this.ctrl).printTime(); 

    }

    /**
     * Called by command 'Journal:printDuration'. Requires three selections (three active cursors) 
     * in current document. It identifies which of the selections are times (in the format hh:mm 
     *  or glued like "1223") and where to print the duration (in decimal form). 
     * For now the duration is always printing hours. 
     *
     * @returns {Q.Promise<void>}
     * @memberof JournalCommands
     */
    public printDuration(): Promise<string> {
        return new J.Features.TimeTrackerTools(this.ctrl).printDuration(); 
    }




    /**
     * Implements commands "yesterday", "today", "yesterday", where the input is predefined (no input box appears)
     * @param offset 
     */
    public async showEntry(offset: number): Promise<vscode.TextEditor | void> {
        return new Promise((resolve, reject) => {
            this.ctrl.logger.trace("Entering showEntry() in ext/commands.ts");

            let input = new J.Model.Input();
            input.offset = offset;
    
            this.loadPageForInput(input)
                .then((doc: vscode.TextDocument) => this.ctrl.ui.showDocument(doc))
                .then(resolve)
                .catch((error: any) => {
                    if (error !== 'cancel') {
                        this.ctrl.logger.error("Failed to get file, reason: ", error);
                        reject(error); 
                    } else {resolve();} 
                    
                });
        });

    }





    /**
     * Creates a new file in a subdirectory with the current day of the month as name.
     * Shows the file to let the user start adding notes right away.
     *
     * @returns {Q.Promise<vscode.TextEditor>}
     * @memberof JournalCommands
     */
    public async showNote(): Promise<vscode.TextEditor | void> {
            this.ctrl.logger.trace("Entering showNote() in ext/commands.ts");

            return this.ctrl.ui.getUserInput("Enter title for new note")
                .then((inputString: string) => this.ctrl.parser.parseInput(inputString))
                .then((input: J.Model.Input) => new J.Features.NoteLoader(input, this.ctrl).load()); 
                   

    }



    public runTestFeature(): Promise<string> {
        this.ctrl.logger.trace("Running the test feature");

        return new Promise((resolve, reject) => {
            resolve("sucess");
        });
    }



    public showError(error: string | Promise<string> | Error): void {
        Promise.resolve(error)
            .then(value => { 
                if (J.Util.isString(value)) {
                    this.showErrorInternal(value as string);
                } else if (J.Util.isError(value)) {
                    this.showErrorInternal((value as Error).message);
                }
            }); 
    }

    private showErrorInternal(errorMessage: string): void {
        let hint = "Check logs.";
        vscode.window.showErrorMessage(errorMessage, hint)
            .then(clickedHint => {
                this.ctrl.logger.showChannel();
            });
    }

    /**
     * Expects any user input from the magic input and either opens the file or creates it. 
     * @param input 
     */
    private async loadPageForInput(input: J.Model.Input): Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering loadPageForInput() in ext/commands.ts");

        if (input instanceof SelectedInput) {
            // we just load the path
            return this.ctrl.ui.openDocument((<SelectedInput>input).path);
        } else if (input instanceof NoteInput) {
            // we create or load the notes
            return this.ctrl.inject.formatNote(input)
                .then(content => this.ctrl.reader.loadNote(input.path, content));
        } else {
            return this.ctrl.reader.loadEntryForInput(input)
                .then((doc: vscode.TextDocument) => this.ctrl.inject.injectInput(doc, input));
        }
    }
}
