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
import * as Q from 'q';
import * as J from './..';
import { isUndefined } from 'util';
import { resolve } from 'path';


interface DecoratedQuickPickItem extends vscode.QuickPickItem {
    parsedInput?: J.Model.Input;
    replace?: boolean;
    pickNote?: boolean;
    pickEntry?: boolean;


}

/** 
 * Anything which extends Visual Studio Code goes here 
 * 
 */

export class VSCode {
    constructor(public ctrl: J.Util.Ctrl) {

    }

    public getUserInputWithValidation(tip: string): Q.Promise<J.Model.Input> {
        let deferred: Q.Deferred<J.Model.Input> = Q.defer<J.Model.Input>();


        const disposables: vscode.Disposable[] = [];

        try {
            // see https://github.com/Microsoft/vscode-extension-samples/blob/master/quickinput-sample/src/quickOpen.ts
            const input = vscode.window.createQuickPick<DecoratedQuickPickItem>();

            // FIXME: localize
            input.placeholder = 'Type to search or create a new entry';
            input.show();

            let today: DecoratedQuickPickItem = { label: "Today", description: "Jump to today's entry", parsedInput: new J.Model.Input(0), alwaysShow: true }
            let tomorrow: DecoratedQuickPickItem = { label: "Tomorrow", description: "Jump to tomorrow's entry", parsedInput: new J.Model.Input(1), alwaysShow: true }
            let pickEntry: DecoratedQuickPickItem = { label: "Pick an entry", detail: "Select from existing journal pages", pickEntry: true, alwaysShow: true }
            let pickNote: DecoratedQuickPickItem = { label: "Pick or create a note", detail: "Select from existing notes", pickNote: true, alwaysShow: true }
            input.items = [today, tomorrow, pickEntry, pickNote];

            let selected: DecoratedQuickPickItem | undefined;

            input.onDidChangeValue(val => {
                // remove placeholder if val is empty
                if (val.length == 0) {
                    if (input.items[0].replace && input.items[0].replace === true) {
                        input.items = input.items.slice(1);
                    }
                    return;
                } else {
                    this.ctrl.parser.parseInput(val).then((parsed: J.Model.Input) => {
                        // this is the placeholder, which gets continuously updated when the user types in anything
                        let item: DecoratedQuickPickItem = {
                            label: val,
                            alwaysShow: true,
                            parsedInput: parsed,
                            replace: true,
                            description: parsed.generateDescription(this.ctrl.config),
                            detail: parsed.generateDetail(this.ctrl.config)
                        };

                        if (input.items[0].replace && input.items[0].replace === true) {
                            input.items = [item].concat(input.items.slice(1))
                        } else {
                            input.items = [item].concat(input.items);
                        }
                    })
                }
            }, disposables);

            input.onDidChangeSelection(sel => {
                selected = sel[0];
            }, disposables);

            input.onDidHide(() => {
                //deferred.reject("cancel");
                input.dispose();
            }, disposables);

            input.onDidAccept(val => {
                if (!selected) return;

                if (!isUndefined(selected.parsedInput)) {
                    deferred.resolve(selected.parsedInput as J.Model.Input);

                } else if (!isUndefined(selected.pickEntry)) {
                    // deferred.resolve(new J.Model.Input(5));

                    this.pickEntry().then(int => {
                        console.log("opening picked entry with offset: " + int.offset);

                        deferred.resolve(int);
                    });
                } else if (!isUndefined(selected.pickNote)) {
                    this.pickNotes().then(int => {
                        console.log("opening picked note");

                        deferred.resolve(int);
                    });
                } else {
                    this.ctrl.parser.parseInput(selected.label).then(deferred.resolve);
                }
            }, disposables);

        } catch (error) {
            deferred.reject(error);
        } finally {
            disposables.forEach(d => d.dispose());
        }

        return deferred.promise;
    };


    public pickEntry(): Q.Promise<J.Model.Input> {
        return Q.Promise<J.Model.Input>((resolve, reject) => {
            try {
                vscode.window.showQuickPick(["1", "2"]).then(selected => {
                    console.log("user picked an entry");

                    resolve(new J.Model.Input(5));
                });
            } catch (error) {
                reject(error);
            }

        });

    }

    public pickNotes(): Q.Promise<J.Model.Input> {
        return Q.Promise<J.Model.Input>((resolve, reject) => {
            try {
                const files: Q.Promise<string[]> = this.ctrl.reader.getPreviousJournalFiles();  


                vscode.window.showQuickPick(files).then(selected => {
                    console.log("user picked an entry");

                    resolve(new J.Model.Input(5));
                });
            } catch (error) {
                reject(error);
            }

        });

    }


    /** 
     * Simple method to have Q Promise for vscode API call to get user input 
     */
    public getUserInput(tip: string): Q.Promise<string> {


        this.ctrl.logger.trace("Entering getUserInput() in ext/vscode.ts");

        let deferred: Q.Deferred<string> = Q.defer<string>();

        let options: vscode.InputBoxOptions = {
            prompt: tip
        };

        vscode.window.showInputBox(options)
            .then((value: string | undefined) => {
                if (!isUndefined(value) && value.length > 0) {
                    deferred.resolve(value);
                } else {
                    // user canceled
                    deferred.reject("cancel");
                }
            });

        return deferred.promise;
    }


    public saveDocument(textDocument: vscode.TextDocument): Q.Promise<vscode.TextDocument> {
        return Q.Promise<vscode.TextDocument>((resolve, reject) => {
            if (textDocument.isDirty) {
                textDocument.save().then(isSaved => {
                    if (isSaved === true) { resolve(textDocument); }
                    else { reject("Failed to save file with path: " + textDocument.fileName) }
                }, rejected => {
                    reject(rejected)
                });
            } else {
                resolve(textDocument);
            }

        });

    }



    public openDocument(path: string | vscode.Uri): Q.Promise<vscode.TextDocument> {
        return Q.Promise<vscode.TextDocument>((resolve, reject) => {

            try {
                if (!(path instanceof vscode.Uri)) path = vscode.Uri.file(path);

                vscode.workspace.openTextDocument(path)
                    .then(onFulfilled => {
                        resolve(onFulfilled);
                    }, onRejected => {
                        reject(onRejected);
                    });

            } catch (error) {
                reject(error);
            }



        });
    }

    /**
     * Shows the given document in Visual Studio Code
     * 
     * @param {vscode.TextDocument} textDocument the document to show
     * @returns {vscode.TextEditor} the associated text editor
     * @memberOf VsCode
     */
    public showDocument(textDocument: vscode.TextDocument): Q.Promise<vscode.TextEditor> {
        this.ctrl.logger.trace("Entering showDocument() in ext/vscode.ts for document: ", textDocument.fileName);

        return Q.Promise<vscode.TextEditor>((resolve, reject) => {

            if (textDocument.isDirty) { textDocument.save(); }

            // check if document is already open
            vscode.window.visibleTextEditors.forEach((editor: vscode.TextEditor) => {
                if (textDocument.fileName.startsWith(editor.document.fileName)) {
                    this.ctrl.logger.debug("Document  ", textDocument.fileName, " is already opened.");
                    resolve(editor);
                }
            });

            let col = this.ctrl.config.isOpenInNewEditorGroup() ? 2 : 1;

            vscode.window.showTextDocument(textDocument, col, false).then(
                view => {

                    // move cursor always to end of file
                    vscode.commands.executeCommand("cursorMove", {
                        to: "down",
                        by: "line",
                        value: textDocument.lineCount
                    });

                    this.ctrl.logger.debug("Showed document  ", textDocument.fileName);
                    resolve(view);
                }, error => {
                    reject(error);
                });


        });
    }



}