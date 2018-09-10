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

import * as moment from 'moment';
import * as Q from 'q';
import { isError, isNullOrUndefined, isString } from 'util';
import * as vscode from 'vscode';
import * as J from '../.';

export interface Commands {
    processInput(): Q.Promise<vscode.TextEditor | null>;
    showNote(): Q.Promise<vscode.TextEditor | null>;
    showEntry(offset: number): Q.Promise<vscode.TextEditor>;
    loadJournalWorkspace(): Q.Promise<{} | undefined>;
    printSum(): Q.Promise<string>;
    printDuration(): Q.Promise<string>;
    printTime(): Q.Promise<string>;

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
    public processInput(): Q.Promise<vscode.TextEditor | null> {
        this.ctrl.logger.trace("Entering processInput() in ext/commands.ts");

        let deferred: Q.Deferred<vscode.TextEditor | null> = Q.defer<vscode.TextEditor | null>();

        this.ctrl.ui.getUserInput("Enter day or memo (with flags) ")
            .then((inputString: string) => this.ctrl.parser.parseInput(inputString))
            .then((input: J.Model.Input) => this.loadPageForInput(input))
            .then(document => this.ctrl.ui.showDocument(document))
            .then((editor: vscode.TextEditor) => deferred.resolve(editor))
            .catch((error: any) => {
                if (error !== 'cancel') {
                    this.ctrl.logger.error("Failed to process input.", error);
                    deferred.reject(error);
                } else {
                    deferred.resolve(null);
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
    public loadJournalWorkspace(): Q.Promise<{} | undefined> {
        this.ctrl.logger.trace("Entering loadJournalWorkspace() in ext/commands.ts");

        var deferred: Q.Deferred<{} | undefined> = Q.defer<{} | undefined>();

        let path = vscode.Uri.file(this.ctrl.config.getBasePath());
        vscode.commands.executeCommand('vscode.openFolder', path, true)
            .then(success => {
                deferred.resolve(success);
            },
                error => {
                    this.ctrl.logger.error("Failed to open journal workspace.", error);
                    deferred.reject("Failed to open journal workspace.");
                });

        return deferred.promise;
    }



    /**
     * Prints the sum of the selected numbers in the current editor at the selection location
     */
    public printSum(): Q.Promise<string> {
        this.ctrl.logger.trace("Entering printSum() in ext/commands.ts");
        return Q.Promise<string>((resolve, reject) => {
            let editor: vscode.TextEditor = <vscode.TextEditor>vscode.window.activeTextEditor;
            let regExp: RegExp = /(\d+[,\.]?\d*\s)|(\s)/;

            let target: vscode.Position;
            let numbers: number[] = [];

            editor.selections.forEach((selection: vscode.Selection) => {
                let range: vscode.Range | undefined = editor.document.getWordRangeAtPosition(selection.active, regExp);

                if (isNullOrUndefined(range)) {
                    target = selection.active;
                    return;
                }

                let text = editor.document.getText(range);

                // check if empty string
                if (text.trim().length === 0) {
                    target = selection.active;

                    return;
                }
                // check if number
                let number: number = Number(text);
                if (number > 0) {
                    numbers.push(number);
                    return;
                }

            });

            if (numbers.length < 2) reject("You have to select at least two numbers");  // tslint:disable-line
            else if (isNullOrUndefined(target!)) reject("No valid target selected for printing the sum.");  // tslint:disable-line  
            else {
                let result: string = numbers.reduce((previous, current) => previous + current).toString();


                this.ctrl.inject.injectString(editor.document, result + "", target!);
                resolve(result);
            }
        });
    }

    /**
     * Prints the current time at the cursor postion
     *
     * @returns {Q.Promise<void>}
     * @memberof JournalCommands
     */
    public printTime(): Q.Promise<string> {
        this.ctrl.logger.trace("Entering printTime() in ext/commands.ts");

        return Q.Promise<string>((resolve, reject) => {
            let editor: vscode.TextEditor = <vscode.TextEditor>vscode.window.activeTextEditor;

            // Todo: identify scope of the active editot
            this.ctrl.config.getTimeStringTemplate().then(tpl => {
                let locale = this.ctrl.config.getLocale();
                return J.Util.formatDate(new Date(), tpl.template, locale);
            }).then((str: string) => {
                let currentPosition: vscode.Position = editor.selection.active;

                this.ctrl.inject.injectString(editor.document, str, currentPosition);

                resolve(str);
            }).catch(error => reject(error))
                .done();

        });

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
    public printDuration(): Q.Promise<string> {
        this.ctrl.logger.trace("Entering printDuration() in ext/commands.ts");

        return Q.Promise<string>((resolve, reject) => {
            try {
                let editor: vscode.TextEditor = <vscode.TextEditor>vscode.window.activeTextEditor;
                let regExp: RegExp = /\d{1,2}:?\d{0,2}(?:\s?(?:am|AM|pm|PM))?|\s/;
                // let regExp: RegExp = /(\d{1,2}:?\d{2}\s)|(\d{1,4}\s?(?:am|pm)\s)|(\d{1,2}[,\.]\d{1,2}\s)|(\s)/;

                if (editor.selections.length !== 3) {
                    throw new Error("To compute the duration, you have to select two times in your text as well as the location where to print it. ");
                }

                // 
                let start: moment.Moment;
                let end: moment.Moment;
                let target: vscode.Position;

                let tpl = this.ctrl.config.getTimeString();

                editor.selections.forEach((selection: vscode.Selection) => {
                    let range: vscode.Range | undefined = editor.document.getWordRangeAtPosition(selection.active, regExp);


                    if (isNullOrUndefined(range)) {
                        target = selection.active;
                        return;
                    }

                    let text = editor.document.getText(range);



                    // check if empty string
                    if (text.trim().length === 0) {
                        target = selection.active;
                        return;
                    }

                    // try to format into date
                    let time: moment.Moment = moment(text, tpl);

                    if (!time.isValid()) {
                        // 123pm
                        let mod: number = text.search(/am|pm/);
                        if (mod > 0) {
                            if (text.charAt(mod - 1) !== " ") {
                                text = text.substr(0, mod - 1) + " " + text.substr(mod);
                            }
                            time = moment(text, "hmm a");
                        }
                    }

                    if (!time.isValid()) {
                        // 123AM
                        let mod: number = text.search(/AM|PM/);
                        if (mod > 0) {
                            if (text.charAt(mod - 1) !== " ") {
                                text = text.substr(0, mod - 1) + " " + text.substr(mod);
                            }
                            time = moment(text, "hmm A");
                        }
                    }

                    if (!time.isValid()) {
                        // 2330
                        time = moment(text, "Hmm");
                    }

                    // parsing glued hours



                    if (isNullOrUndefined(start)) { start = time; }
                    else if (start.isAfter(time)) {
                        end = start;
                        start = time;
                    } else {
                        end = time;
                    }
                });

                if (isNullOrUndefined(start!)) reject("No valid start time selected");  // tslint:disable-line
                else if (isNullOrUndefined(end!)) reject("No valid end time selected");  // tslint:disable-line
                else if (isNullOrUndefined(target!)) reject("No valid target selected for printing the duration.");  // tslint:disable-line  
                else {
                    let duration = moment.duration(start!.diff(end!));
                    let formattedDuration = Math.abs(duration.asHours()).toFixed(2);


                    this.ctrl.inject.injectString(editor.document, formattedDuration, target!);
                    resolve(formattedDuration);
                }





            } catch (error) {
                reject(error);
            }


        });
    }




    /**
     * Implements commands "yesterday", "today", "yesterday", where the input is predefined (no input box appears)
     * @param offset 
     */
    public showEntry(offset: number): Q.Promise<vscode.TextEditor> {
        this.ctrl.logger.trace("Entering showEntry() in ext/commands.ts");

        var deferred: Q.Deferred<vscode.TextEditor> = Q.defer<vscode.TextEditor>();

        let input = new J.Model.Input();
        input.offset = offset;

        this.loadPageForInput(input)
            .then((doc: vscode.TextDocument) => this.ctrl.ui.showDocument(doc))
            .then((editor: vscode.TextEditor) => deferred.resolve(editor))
            .catch((error: any) => {
                if (error !== 'cancel') {
                    console.error("[Journal]", "Failed to get file, Reason: ", error);

                }
                deferred.reject(error);
            })
            .done();

        return deferred.promise;
    }



    /**
     * Creates a new file in a subdirectory with the current day of the month as name.
     * Shows the file to let the user start adding notes right away.
     *
     * @returns {Q.Promise<vscode.TextEditor>}
     * @memberof JournalCommands
     */
    public showNote(): Q.Promise<vscode.TextEditor | null> {
        this.ctrl.logger.trace("Entering showNote() in ext/commands.ts");

        var deferred: Q.Deferred<vscode.TextEditor | null> = Q.defer<vscode.TextEditor | null>();

        this.ctrl.ui.getUserInput("Enter title for new note")
            .then((inputString: string) => this.ctrl.parser.parseInput(inputString))
            .then((input: J.Model.Input) =>
                Q.all([
                    this.ctrl.parser.resolveNotePathForInput(input),
                    this.ctrl.inject.buildNoteContent(input)
                ])
            )
            .then(([path, content]) => 
                this.ctrl.reader.loadNote(path, content))
            .then((doc: vscode.TextDocument) =>
                this.ctrl.ui.showDocument(doc))
            .then((editor: vscode.TextEditor) => {
                /** 
                 *  inject reference to new note in today's journal page
                */
                this.ctrl.reader.loadEntryForOffset(0); // triggered automatically by loading today's page
                return editor; 
                
                /*
                return this.ctrl.reader.loadEntryForOffset(0)
                    .then(todayDoc => {
                        // TODO: correct the file name
                        let correctedFilename = editor.document.uri.path.substring(editor.document.uri.path.lastIndexOf("/") + 1);
                        return this.ctrl.inject.buildReference(todayDoc, correctedFilename);
                    })
                    .then( inlineString => {
                        return this.ctrl.inject.injectInlineString(inlineString);
                    })
                    .then(todayDoc => {
                        if(isNullOrUndefined(todayDoc)) deferred.reject("Failed to create reference to note"); 

                        todayDoc.save(); 
                        return editor;
                    }); */                  
            })
            .then((editor: vscode.TextEditor) => {

                deferred.resolve(editor); 
            })
            .catch(reason => {
                if (reason !== 'cancel') {
                    console.error("[Journal]", "Failed to how note", reason);
                    deferred.reject(reason);
                } else { deferred.resolve(null); }


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


    public showError(error: string | Q.Promise<string> | Error): void {

        if (Q.isPromise(error)) {
            (<Q.Promise<string>>error).then((value) => {
                // conflict between Q.IPromise and vscode.Thenable
                this.showErrorInternal(value);
            });
        }

        if (isString(error)) {
            this.showErrorInternal(error);
        }

        if (isError(error)) {
            this.showErrorInternal(error.message);
        }
    }

    private showErrorInternal(errorMessage: string): void {
        let hint = "Check logs.";
        vscode.window.showErrorMessage(errorMessage, hint)
            .then(clickedHint => {
                this.ctrl.logger.channel.show();
            });
    }

    private loadPageForInput(input: J.Model.Input): Q.Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering loadPageForInput() in ext/commands.ts");


        let deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();

        this.ctrl.reader.loadEntryForOffset(input.offset)
            .then((doc: vscode.TextDocument) => this.ctrl.inject.injectInput(doc, input))
            .then((doc: vscode.TextDocument) => deferred.resolve(doc))
            .catch(error => deferred.reject(error))
            .done();


        return deferred.promise;
    }
}
