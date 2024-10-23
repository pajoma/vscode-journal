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
import * as J from '..';
import * as Path from 'path';
import { isNotNullOrUndefined,  } from '../util';
import { SCOPE_DEFAULT } from './conf';
import moment = require('moment');
import {  JournalPageType } from '../model';
import {  sortPickEntries } from '../provider';




/** 
 * Anything which extends Visual Studio Code goes here 
 * 
 */
export class Dialogues {

    private scanner; 

    constructor(public ctrl: J.Util.Ctrl) {
        this.scanner = new J.Provider.ScanEntries(this.ctrl); 
    }


    /**
     * 
     */
    public async getUserInputWithValidation(): Promise<J.Model.Input> {
        return new Promise((resolve, reject) => {
            const disposables: vscode.Disposable[] = [];

            try {
                // see https://github.com/Microsoft/vscode-extension-samples/blob/master/quickinput-sample/src/quickOpen.ts
                const input: J.Model.TimedQuickPick = vscode.window.createQuickPick<J.Model.DecoratedQuickPickItem>();
                input.start = new Date().getTime(); 

                // FIXME: localize
                input.show();
                

                let today: J.Model.DecoratedQuickPickItem = { label: J.Extension.getInputLabelTranslation(1), description: J.Extension.getInputDetailsTranslation(1), pickItem: J.Model.JournalPageType.entry, parsedInput: new J.Model.Input(0), alwaysShow: true, path: "" };
                let tomorrow: J.Model.DecoratedQuickPickItem = { label: J.Extension.getInputLabelTranslation(2), description: J.Extension.getInputDetailsTranslation(2), pickItem: J.Model.JournalPageType.entry, parsedInput: new J.Model.Input(1), alwaysShow: true, path: "" };
                let pickEntry: J.Model.DecoratedQuickPickItem = { label: J.Extension.getInputLabelTranslation(3), description: J.Extension.getInputDetailsTranslation(3), pickItem: J.Model.JournalPageType.entry, alwaysShow: true, path: "" };
                let pickNote: J.Model.DecoratedQuickPickItem = { label: J.Extension.getInputLabelTranslation(4), description: J.Extension.getInputDetailsTranslation(4), pickItem: J.Model.JournalPageType.note, alwaysShow: true, path: "" };
                input.items = [today, tomorrow, pickEntry, pickNote];

                let selected: J.Model.DecoratedQuickPickItem | undefined;

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
                            let item: J.Model.DecoratedQuickPickItem = {
                                label: val,
                                path: "",
                                alwaysShow: true,
                                parsedInput: parsed,
                                replace: true,
                                description: this.generateDescription(parsed),
                                detail: this.generateDetail(parsed)
                                // detail: parsed.generateDetail(this.ctrl.config)
                            };

                            if (input.items[0].replace && input.items[0].replace === true) {
                                input.items = [item].concat(input.items.slice(1));
                            } else {
                                input.items = [item].concat(input.items);
                            }
                        }).catch(error => {
                            this.ctrl.logger.trace("Warning: "+error); 
                            // do nothin
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
                    if (!selected) { return; }

                    if (J.Util.isNotNullOrUndefined(selected.parsedInput)) {
                        resolve(selected.parsedInput as J.Model.Input);

                    } else if (J.Util.isNotNullOrUndefined(selected.pickItem) && selected.pickItem === J.Model.JournalPageType.entry) {
                        this.pickItem(J.Model.JournalPageType.entry).then(selected => {
                            resolve(selected);
                        });
                    } else if (J.Util.isNotNullOrUndefined(selected.pickItem) && selected.pickItem === J.Model.JournalPageType.note) {
                        this.pickItem(J.Model.JournalPageType.note).then(selected => {
                            resolve(selected);
                        });
                    } else if (J.Util.isNotNullOrUndefined(selected.pickItem) && selected.pickItem === J.Model.JournalPageType.attachement) {
                        this.pickItem(J.Model.JournalPageType.attachement).then(selected => {
                            resolve(selected);
                        });
                    } else {
                        this.ctrl.parser.parseInput(selected.label).then(resolve);
                    }
                }, disposables);

            } catch (error) {
                this.ctrl.logger.error("Failed to get user input", error);
                reject(error);
            } finally {
                disposables.forEach(d => d.dispose());
            }
        });

    };


    private generateDescription(parsed: J.Model.Input): string {
        moment.locale(this.ctrl.config.getLocale());

        let date = new Date();
        date.setDate(date.getDate() + parsed.offset);
        return moment(date).format("ddd, LL");
    }


    private generateDetail(parsed: J.Model.Input): string {
        moment.locale(this.ctrl.config.getLocale());

        let date = new Date();
        date.setDate(date.getDate() + parsed.offset);
        let t: moment.Moment = moment(date);

        let time: string = t.calendar(moment(), this.ctrl.config.getInputDetailsTimeFormat());

        if (parsed.hasWeek() && !parsed.hasTask()) { return J.Extension.getInputDetailsStringForWeekly(parsed.week); }
        if (parsed.hasWeek() && parsed.hasTask()) { return J.Extension.getInputDetailsStringForTaskInWeek(parsed.week); }
        if (parsed.hasTask()) { return J.Extension.getInputDetailsStringForTask(time); }
        if (parsed.hasMemo()) { return J.Extension.getInputDetailsStringForMemo(time); }

        return J.Extension.getInputDetailsStringForEntry(time);
    }


    private collectScanDirectories(type: J.Model.JournalPageType) : Set<J.Model.ScopeDirectory> {


        let baseDirectories: J.Model.ScopeDirectory[] = [];
        this.ctrl.config.getScopes().forEach(scope => {
            // let dir = this.ctrl.config.getBasePath(scope); 
            let pattern = ""; 

            if(type === JournalPageType.entry) {
                pattern = this.ctrl.config.getEntryPathPattern(scope); 
            }
            else if(type === JournalPageType.note) {
                pattern = this.ctrl.config.getNotesPathPattern(scope); 
            }

            // replace base and resolve
            pattern = pattern.replace("${base}", this.ctrl.config.getBasePath(scope)); 
            pattern = Path.normalize(pattern); 

            // stop when date variables appear in path
            let pathSegments: string[] = pattern.split(Path.sep); 
            let filteredSegments: string[] = []; 
            for(let segment of pathSegments) {
                if(segment.startsWith("${")) { break; } 
                else {filteredSegments.push(segment);} 
            }
            const directory = Path.join(...filteredSegments);

            let scopedBaseDirectory: J.Model.ScopeDirectory = {
                path: directory,
                scope: scope
            };
            

            if (J.Util.stringIsNotEmpty(scopedBaseDirectory.path)) { 
                if(baseDirectories.findIndex(item => item.path === scopedBaseDirectory.path) === -1) {
                    baseDirectories.push(scopedBaseDirectory); 
                }
            }
        });

        return new Set(baseDirectories); 
    } 
   

    /**
     * 
     * @param type 
     */
    public async pickItem(type: J.Model.JournalPageType): Promise<J.Model.Input> {
        return new Promise((resolve, reject) => {

            const disposables: vscode.Disposable[] = [];

            try {

                // Fixme, identify scopes while typing and switch base path if needed
                // const base = this.ctrl.config.getBasePath();
                const input: J.Model.TimedQuickPick = vscode.window.createQuickPick<J.Model.DecoratedQuickPickItem>();
                input.start = new Date().getTime();
                input.matchOnDescription = true; 

                let selected: J.Model.DecoratedQuickPickItem | undefined;

                input.busy = true;

                // collect directories to scan (including in scopes)
                const directories = this.collectScanDirectories(type);                


                /* slow: get everything async for search */
                // Update: populating the list is async now using a callback, which means we lose the option of sorting the list
                

                this.scanner.getPreviouslyAccessedFiles(this.ctrl.config.getInputTimeThreshold(), addItemToPickList, input, type, directories);
                input.show();
                /* fast: get last updated file within time period sync (quick selection only)
                this.scanner.getPreviouslyAccessedFilesSync(this.ctrl.config.getInputTimeThreshold(), baseDirectories)
                    .then((values: J.Model.FileEntry[]) => {
                        values.forEach(fe => this.addItem(fe, input, type));


                    }).then(() => {
                        this.ctrl.logger.debug("Found items while scanning directories: " + input.items.length);

                        input.busy = false;
                        input.show();
                    });
                */
                input.onDidChangeSelection(sel => {
                    selected = sel[0];
                }, disposables);

                // placeholder only for notes
                if (type === J.Model.JournalPageType.note) {
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

                                this.ctrl.logger.debug("Tags in input string: [" + ((inputText.tags.length === 0) ? "" : inputText.tags) + "] and scope " + inputText.scope);

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

                                let item: J.Model.DecoratedQuickPickItem = {
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
                            resolve(selected!.parsedInput!);
                        } else {
                            // deferred.resolve(new J.Model.SelectedInput(Path.join(base, selected.label)))
                            resolve(new J.Model.SelectedInput(selected!.path));
                        }

                    } else { reject("cancel"); }
                }, disposables);

            } catch (error) {
                this.ctrl.logger.error("Failed to pick item", error);
                reject(error);
            } finally {
                disposables.forEach(d => d.dispose());
            }
        });

    }



    /** 
     * Simple method to have Q Promise for vscode API call to get user input 
     */
    public async getUserInput(tip: string): Promise<string> {

        return new Promise((resolve, reject) => {
            this.ctrl.logger.trace("Entering getUserInput() in ext/vscode.ts");

            try {
                let options: vscode.InputBoxOptions = {
                    prompt: tip
                };

                vscode.window.showInputBox(options)
                    .then((value: string | undefined) => {
                        if (isNotNullOrUndefined(value) && value!.length > 0) {
                            resolve(value!);
                        } else {
                            // user canceled
                            this.ctrl.logger.debug("User canceled");

                            reject("cancel");
                        }
                    });

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


    public async saveDocument(textDocument: vscode.TextDocument): Promise<vscode.TextDocument> {
        return new Promise((resolve, reject) => {
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
                if (error instanceof Error) {
                    this.ctrl.logger.error(error.message);
                    reject(error);
                } else {
                    reject("Failed to save document");
                }


            }
        });
    }



    public async openDocument(path: string | vscode.Uri): Promise<vscode.TextDocument> {
        return new Promise((resolve, reject) => {
            try {
                if (!(path instanceof vscode.Uri)) { path = vscode.Uri.file(path); }

                vscode.workspace.openTextDocument(path)
                    .then(onFulfilled => {
                        resolve(onFulfilled);
                    }, onRejected => {
                        reject(onRejected);
                    });

            } catch (error: unknown) {
                if (error instanceof Error) {
                    this.ctrl.logger.error(error.message);
                    reject(error);
                } else {
                    reject("Failed to open document");
                }
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
    public async showDocument(textDocument: vscode.TextDocument): Promise<vscode.TextEditor> {


        return new Promise((resolve, reject) => {
            this.ctrl.logger.trace("Entering showDocument() in ext/vscode.ts for document: ", textDocument.fileName);

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
                if (error instanceof Error) {
                    this.ctrl.logger.error(error.message);
                    reject(error);
                } else {
                    reject("Failed to show document");
                }
            }
        });
    }


    public async showError(error: string | Error): Promise<void> {

        if (J.Util.isString(error)) {
            this.showErrorInternal(error as string);
        }

        if (J.Util.isError(error)) {
            this.showErrorInternal((error as Error).message);
        }
    }

    private showErrorInternal(errorMessage: string): void {
        let hint = "Open the logs to see details.";
        vscode.window.showErrorMessage(errorMessage, hint)
            .then(clickedHint => {
                this.ctrl.logger.showChannel();
            });
    }
}

 /**
     * Callback function for filewalker to add an item to our quickpick list. 
     * 
     * Note: This is a trigger as callback, has no access to current class members
     * 
     * @param fe 
     */
function addItemToPickList(entries: J.Model.FileEntry[], input: J.Model.TimedQuickPick, type: J.Model.JournalPageType) {

    const items:  J.Model.DecoratedQuickPickItem[] = []; 

    entries.forEach(fe => {
        Object.freeze(fe);     // immutable

        if (fe.type !== type) { return; }

        
        // check if already present
        if (input.items.findIndex(item => fe.path === item.path) >= 0) { return; }

        let displayName = fe.name; 

        // if it's a journal page, we prefix the month for visualizing 
        if (type === J.Model.JournalPageType.entry) {
            let pathItems = fe.path.split(Path.sep);
            displayName = pathItems[pathItems.length - 2] + Path.sep + pathItems[pathItems.length - 1];
        }

        // if it's a note, we denormalize the displayed name
        if (type === J.Model.JournalPageType.note) {
            displayName = J.Util.denormalizeFilename(fe.name);
        }

        /* and we prefix the scope (#122) 
        if (fe.scope && fe.scope.length > 0 && fe.scope !== J.Extension.SCOPE_DEFAULT) {
            fe.name = `#${fe.scope} ${fe.name}`; 
        }*/

        // add icons
        switch(fe.type) {
            case JournalPageType.note: {
               if(fe.scope === SCOPE_DEFAULT)  { displayName = `$(circle-large-outline) ${displayName}`; break;  }
               else {displayName = `$(circle-large-filled) ${displayName}`; break; }
            }  
            case JournalPageType.entry:  displayName = `$(clock) ${displayName}`; break; 
            case JournalPageType.attachement:  displayName = `$(package) ${displayName}`; break; 
        }
        

        // format description
        // if its with the last week, we just print the weekday.. 
        
        let displayDescription = ""; 
        try {
            let displayDate = moment(fe.createdAt);
        
            if(displayDate.isAfter(moment().subtract(7, "d"))) {
                displayDescription += displayDate.format(J.Extension.getPickDetailsTranslation(2));
            } else {
                displayDescription += displayDate.format(J.Extension.getPickDetailsTranslation(1));
            }
        } catch (error) {
            console.error("Failed to extract date from entry with name: ", displayName, error); 
        }
        console.log("adding file in scope", fe.scope); 
        if (fe.scope !== SCOPE_DEFAULT) { 
            displayDescription += ` | #${fe.scope}`; 
        }

        
    
        let item: J.Model.DecoratedQuickPickItem = {
            label: displayName,
            path: fe.path,
            fileEntry: fe,
            description: displayDescription
        };
        input.items = input.items.concat(item); 
    
    }); 


    /* we have to sort the items list */
    input.items = Array.from(input.items).sort((a, b) => sortPickEntries(a.fileEntry!, b.fileEntry!));
    
    /* Some voodoo to stop the spinner. Since it's a mess to find out when the recursive directory walker is finished, we simply finish after 3 seconds.  */
    if((input.items.length > 20) || (((new Date().getTime()) - input.start!) > 3000 )) {
        input.busy = false; 
    }
    

}