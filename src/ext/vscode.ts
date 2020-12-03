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
import * as Path from 'path';
import { isNotNullOrUndefined, isNullOrUndefined } from './../util';
import { JournalPageType, SCOPE_DEFAULT } from './conf';
import { FileEntry, BaseDirectory } from '../actions/reader';
import moment = require('moment');


interface DecoratedQuickPickItem extends vscode.QuickPickItem {
    parsedInput?: J.Model.Input;
    replace?: boolean;
    path: string;
    pickItem?: JournalPageType;
    fileEntry?: FileEntry;
}

/** 
 * Anything which extends Visual Studio Code goes here 
 * 
 */
export class VSCode {
    constructor(public ctrl: J.Util.Ctrl) {

    }



    /**
     * 
     */
    public getUserInputWithValidation(): Q.Promise<J.Model.Input> {
        let deferred: Q.Deferred<J.Model.Input> = Q.defer<J.Model.Input>();


        const disposables: vscode.Disposable[] = [];

        try {
            // see https://github.com/Microsoft/vscode-extension-samples/blob/master/quickinput-sample/src/quickOpen.ts
            const input = vscode.window.createQuickPick<DecoratedQuickPickItem>();

            // FIXME: localize
            input.show();

            let today: DecoratedQuickPickItem = { label: this.ctrl.config.getInputLabelTranslation(1), description: this.ctrl.config.getInputDetailsTranslation(1), pickItem: JournalPageType.ENTRY, parsedInput: new J.Model.Input(0), alwaysShow: true, path: "" };
            let tomorrow: DecoratedQuickPickItem = { label: this.ctrl.config.getInputLabelTranslation(2), description: this.ctrl.config.getInputDetailsTranslation(2), pickItem: JournalPageType.ENTRY, parsedInput: new J.Model.Input(1), alwaysShow: true, path: "" };
            let pickEntry: DecoratedQuickPickItem = { label: this.ctrl.config.getInputLabelTranslation(3), description: this.ctrl.config.getInputDetailsTranslation(3), pickItem: JournalPageType.ENTRY, alwaysShow: true, path: "" };
            let pickNote: DecoratedQuickPickItem = { label: this.ctrl.config.getInputLabelTranslation(4), description: this.ctrl.config.getInputDetailsTranslation(4), pickItem: JournalPageType.NOTE, alwaysShow: true, path: "" };
            // let pickAttachement: DecoratedQuickPickItem = { label: this.ctrl.config.getInputLabelTranslation(5), description: this.ctrl.config.getInputDetailsTranslation(5), pickItem: JournalPageType.ATTACHEMENT, alwaysShow: true }
            input.items = [today, tomorrow, pickEntry, pickNote];

            let selected: DecoratedQuickPickItem | undefined;

            input.onDidChangeValue(val => {
                // remove placeholder if val is empty
                if (val.length === 0) {
                    if (input.items[0].replace && input.items[0].replace === true) {
                        input.items = input.items.slice(1);
                    }
                    return;
                } else {
                    this.ctrl.parser.parseInput(val).then((parsed: J.Model.Input) => {
                        // this is the placeholder, which gets continuously updated when the user types in anything
                        let item: DecoratedQuickPickItem = {
                            label: val,
                            path: "",
                            alwaysShow: true,
                            parsedInput: parsed,
                            replace: true,
                            description: parsed.generateDescription(this.ctrl.config),
                            detail: parsed.generateDetail(this.ctrl.config)
                        };

                        if (input.items[0].replace && input.items[0].replace === true) {
                            input.items = [item].concat(input.items.slice(1));
                        } else {
                            input.items = [item].concat(input.items);
                        }
                    });
                }
            }, disposables);

            input.onDidChangeSelection(sel => {
                selected = sel[0];
            }, disposables);

            input.onDidHide(() => {
                // deferred.reject("cancel");
                input.dispose();
            }, disposables);

            input.onDidAccept(val => {
                if (!selected) {return;}

                if (J.Util.isNotNullOrUndefined(selected.parsedInput)) {
                    deferred.resolve(selected.parsedInput as J.Model.Input);

                } else if (J.Util.isNotNullOrUndefined(selected.pickItem) && selected.pickItem === JournalPageType.ENTRY) {
                    this.pickItem(JournalPageType.ENTRY).then(selected => {
                        deferred.resolve(selected);
                    });
                } else if (J.Util.isNotNullOrUndefined(selected.pickItem) && selected.pickItem === JournalPageType.NOTE) {
                    this.pickItem(JournalPageType.NOTE).then(selected => {
                        deferred.resolve(selected);
                    });
                } else if (J.Util.isNotNullOrUndefined(selected.pickItem) && selected.pickItem === JournalPageType.ATTACHEMENT) {
                    this.pickItem(JournalPageType.ATTACHEMENT).then(selected => {
                        deferred.resolve(selected);
                    });
                } else {
                    this.ctrl.parser.parseInput(selected.label).then(deferred.resolve);
                }
            }, disposables);

        } catch (error) {
            this.ctrl.logger.error("Failed to get user input", error);
            deferred.reject(error);
        } finally {
            disposables.forEach(d => d.dispose());
        }

        return deferred.promise;
    };


    /**
     * Callback function for filewalker to add an item to our quickpick list
     * 
     * @param fe 
     */
    public addItem(fe: FileEntry, input: vscode.QuickPick<DecoratedQuickPickItem>, type: JournalPageType) {
        if (fe.type !== type) {return;}

        // check if already present
        if (input.items.findIndex(item => fe.path === item.path) >= 0) {return;}


        // if it's a journal page, we prefix the month for visualizing 
        if (type === JournalPageType.ENTRY) {
            let pathItems = fe.path.split(Path.sep);
            fe.name = pathItems[pathItems.length - 2] + Path.sep + pathItems[pathItems.length - 1];
        }

        // if it's a note, we denormalize der displayed the name
        if (type === JournalPageType.NOTE) {
            fe.name = J.Util.denormalizeFilename(fe.name);
        }

        // format description
        let desc: string = moment(fe.created_at).format("LL");
        if (fe.scope !== SCOPE_DEFAULT) {desc += " in scope " + fe.scope;}

        let item: DecoratedQuickPickItem = {
            label: fe.name,
            path: fe.path,
            fileEntry: fe,
            description: desc
        };
        input.items = input.items.concat(item).sort((a, b) => (b.fileEntry!.created_at - a.fileEntry!.created_at));
        /*
        values.sort((a, b) => (a.update_at - b.update_at))
        .filter((fe: FileEntry) => fe.type === type)
        .forEach(fe => this.addItem(fe, input, type))
        */
    }

    /**
     * 
     * @param type 
     */
    public pickItem(type: JournalPageType) {
        let deferred: Q.Deferred<J.Model.Input> = Q.defer<J.Model.Input>();
        const disposables: vscode.Disposable[] = [];

        try {

            // Fixme, identify scopes while typing and switch base path if needed
            const base = this.ctrl.config.getBasePath();
            const input = vscode.window.createQuickPick<DecoratedQuickPickItem>();


            let selected: DecoratedQuickPickItem | undefined;



            input.busy = true;

            // collect directories to scan (including in scopes)
            let baseDirectories: BaseDirectory[] = [];
            this.ctrl.config.getScopes().forEach(scope => {
                let scopedBaseDirectory: BaseDirectory = {
                    path: this.ctrl.config.getBasePath(scope),
                    scope: scope
                };
                if (J.Util.stringIsNotEmpty(scopedBaseDirectory.path)) {baseDirectories.push(scopedBaseDirectory);}
            });


            /* slow: get everything async for search */
            // Update: populating the list is async now using a callback, which means we lose the option of sorting the list
            this.ctrl.reader.getPreviouslyAccessedFiles(this.ctrl.config.getInputTimeThreshold(), this.addItem, input, type, baseDirectories);

            /* fast: get last updated file within time period sync (quick selection only) */
            this.ctrl.reader.getPreviouslyAccessedFilesSync(this.ctrl.config.getInputTimeThreshold(), baseDirectories)
                .then((values: FileEntry[]) => {
                    values.forEach(fe => this.addItem(fe, input, type));


                }).then(() => {
                    this.ctrl.logger.debug("Found items: " + input.items.length);

                    input.busy = false;
                    input.show();
                });

            input.onDidChangeSelection(sel => {
                selected = sel[0];
            }, disposables);

            // placeholder only for notes
            if (type === JournalPageType.NOTE) {
                input.onDidChangeValue(val => {
                    if (val.length === 0) {
                        if (input.items[0].replace && input.items[0].replace === true) {
                            input.items = input.items.slice(1);
                        }
                        return;
                    } else {
                        let inputText = new J.Model.NoteInput();
                        inputText.text = val;


                        this.ctrl.parser.resolveNotePathForInput(inputText).then(path => {
                            inputText.path = path;

                            this.ctrl.logger.debug("Tags in input string: [" + ((inputText.tags.length === 0) ? "" : inputText.tags)  + "] and scope " + inputText.scope);

                            // infer description
                            let description: string = "";
                            if (inputText.scope === SCOPE_DEFAULT) {
                                description = "Create new note in default path";
                            } else {
                                description = "Create new note in scope \"" + inputText.scope + "\"";
                            }

                            if (inputText.tags.length > 0) {
                                description += " and tags " + inputText.tags;
                            }

                            let item: DecoratedQuickPickItem = {
                                label: inputText.text,
                                path: path,
                                alwaysShow: true,
                                replace: true,
                                parsedInput: inputText,
                                description: description
                            };
                            if (input.items.length > 0 && input.items[0].replace && input.items[0].replace === true) {
                                input.items = [item].concat(input.items.slice(1));
                            } else {
                                input.items = [item].concat(input.items);
                            }
                        });


                    }
                }, disposables);
            }



            input.onDidAccept(() => {
                if (isNotNullOrUndefined(selected)) {
                    if (isNotNullOrUndefined(selected!.parsedInput)) {
                        deferred.resolve(selected!.parsedInput!);
                    } else {
                        // deferred.resolve(new J.Model.SelectedInput(Path.join(base, selected.label)))
                        deferred.resolve(new J.Model.SelectedInput(selected!.path));
                    }

                } else { deferred.reject("cancel"); }
            }, disposables);

        } catch (error) {
            this.ctrl.logger.error("Failed to pick item", error);
            deferred.reject(error);
        } finally {
            disposables.forEach(d => d.dispose());
        }

        return deferred.promise;

    }



    /** 
     * Simple method to have Q Promise for vscode API call to get user input 
     */
    public getUserInput(tip: string): Q.Promise<string> {


        this.ctrl.logger.trace("Entering getUserInput() in ext/vscode.ts");

        let deferred: Q.Deferred<string> = Q.defer<string>();
        try {
            let options: vscode.InputBoxOptions = {
                prompt: tip
            };
    
            vscode.window.showInputBox(options)
                .then((value: string | undefined) => {
                    if (isNotNullOrUndefined(value) && value!.length > 0) {
                        deferred.resolve(value!);
                    } else {
                        // user canceled
                        this.ctrl.logger.debug("User canceled");
                        
                        deferred.reject("cancel");
                    }
                });
    
            
        } catch (error) {
            this.ctrl.logger.error(error);
            deferred.reject(error);
        }
        return deferred.promise;
        
    }


    public saveDocument(textDocument: vscode.TextDocument): Q.Promise<vscode.TextDocument> {
        return Q.Promise<vscode.TextDocument>((resolve, reject) => {
            try {
                if (textDocument.isDirty) {
                    textDocument.save().then(isSaved => {
                        if (isSaved === true) { resolve(textDocument); }
                        else { reject("Failed to save file with path: " + textDocument.fileName); }
                    }, rejected => {
                        this.ctrl.logger.error("Failed to save file with path. Reason: " + rejected);
                        reject(rejected);
                    });
                } else {
                    resolve(textDocument);
                }
            } catch (error) {
                this.ctrl.logger.error(error);
                reject(error);
            }
        });
    }



    public openDocument(path: string | vscode.Uri): Q.Promise<vscode.TextDocument> {
        return Q.Promise<vscode.TextDocument>((resolve, reject) => {
            try {
                if (!(path instanceof vscode.Uri)) {path = vscode.Uri.file(path);}

                vscode.workspace.openTextDocument(path)
                    .then(onFulfilled => {
                        resolve(onFulfilled);
                    }, onRejected => {
                        reject(onRejected);
                    });

            } catch (error) {
                this.ctrl.logger.error(error);
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
            try {
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
                        this.ctrl.logger.error(error);
                        reject(error);
                    });
            } catch (error) {
                this.ctrl.logger.error(error);
                reject(error);
            }
        });
    }



}