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
import * as Path from 'path';
import { isNotNullOrUndefined, isString, isError, stringIsNotEmpty, denormalizeFilename } from '../util';
import { SCOPE_DEFAULT } from './conf';
import moment = require('moment');
import { IConfiguration, IFileSystem, ILogger, IParser, JournalPageType, Input, ScopeDirectory, NoteInput, SelectedInput, FileEntry } from '../model';
import { sortPickEntries, ScanEntries, TimedQuickPick, DecoratedQuickPickItem } from '../features/entries/scan-entries';




/** 
 * Anything which extends Visual Studio Code goes here 
 * 
 */
export class Dialogues {

    private scanner: ScanEntries;

    constructor(private config: IConfiguration, private logger: ILogger, private parser: IParser, fs: IFileSystem) {
        this.scanner = new ScanEntries(config, logger, fs);
    }

    public getScanner(): ScanEntries {
        return this.scanner;
    }


    /**
     * 
     */
    public async getUserInputWithValidation(): Promise<Input> {
        return new Promise((resolve, reject) => {
            const disposables: vscode.Disposable[] = [];

            try {
                // see https://github.com/Microsoft/vscode-extension-samples/blob/master/quickinput-sample/src/quickOpen.ts
                const input: TimedQuickPick = vscode.window.createQuickPick<DecoratedQuickPickItem>();
                input.start = new Date().getTime();

                // FIXME: localize
                input.show();


                let today: DecoratedQuickPickItem = { label: vscode.l10n.t("Today"), description: vscode.l10n.t("Jump to today's entry."), pickItem: JournalPageType.entry, parsedInput: new Input(0), alwaysShow: true, path: "" };
                let tomorrow: DecoratedQuickPickItem = { label: vscode.l10n.t("Tomorrow"), description: vscode.l10n.t("Jump to tomorrow's entry."), pickItem: JournalPageType.entry, parsedInput: new Input(1), alwaysShow: true, path: "" };
                let pickEntry: DecoratedQuickPickItem = { label: vscode.l10n.t("Select entry"), description: vscode.l10n.t("Select from the last journal entries."), pickItem: JournalPageType.entry, alwaysShow: true, path: "" };
                let pickNote: DecoratedQuickPickItem = { label: vscode.l10n.t("Select/Create a note"), description: vscode.l10n.t("Create a new note or select from recently created or updated notes."), pickItem: JournalPageType.note, alwaysShow: true, path: "" };
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
                        this.parser.parseInput(val).then((parsed: Input) => {
                            // this is the placeholder, which gets continuously updated when the user types in anything
                            let item: DecoratedQuickPickItem = {
                                label: val,
                                path: "",
                                alwaysShow: true,
                                parsedInput: parsed,
                                replace: true,
                                description: this.generateDescription(parsed),
                                detail: this.generateDetail(parsed)
                            };

                            if (input.items[0].replace && input.items[0].replace === true) {
                                input.items = [item].concat(input.items.slice(1));
                            } else {
                                input.items = [item].concat(input.items);
                            }
                        }).catch(error => {
                            this.logger.trace("Warning: " + error);
                            // do nothin
                        });
                    }
                }, disposables);

                input.onDidChangeSelection(sel => {
                    selected = sel[0];
                }, disposables);

                input.onDidHide(() => {
                    input.dispose();
                }, disposables);

                input.onDidAccept(val => {
                    if (!selected) { return; }

                    if (isNotNullOrUndefined(selected.parsedInput)) {
                        resolve(selected.parsedInput as Input);

                    } else if (isNotNullOrUndefined(selected.pickItem) && selected.pickItem === JournalPageType.entry) {
                        this.pickItem(JournalPageType.entry).then(selected => {
                            resolve(selected);
                        });
                    } else if (isNotNullOrUndefined(selected.pickItem) && selected.pickItem === JournalPageType.note) {
                        this.pickItem(JournalPageType.note).then(selected => {
                            resolve(selected);
                        });
                    } else if (isNotNullOrUndefined(selected.pickItem) && selected.pickItem === JournalPageType.attachement) {
                        this.pickItem(JournalPageType.attachement).then(selected => {
                            resolve(selected);
                        });
                    } else {
                        this.parser.parseInput(selected.label).then(resolve);
                    }
                }, disposables);

            } catch (error) {
                this.logger.error("Failed to get user input", error);
                reject(error);
            } finally {
                disposables.forEach(d => d.dispose());
            }
        });

    };


    private generateDescription(parsed: Input): string {
        moment.locale(this.config.getLocale());

        let date = new Date();
        date.setDate(date.getDate() + parsed.offset);
        return moment(date).format("ddd, LL");
    }


    private generateDetail(parsed: Input): string {
        moment.locale(this.config.getLocale());

        let date = new Date();
        date.setDate(date.getDate() + parsed.offset);
        let t: moment.Moment = moment(date);

        let time: string = t.calendar(moment(), this.config.getInputDetailsTimeFormat());

        if (parsed.hasWeek() && !parsed.hasTask()) {
            return vscode.l10n.t("Open notes for week {week}", { week: parsed.week });
        }
        if (parsed.hasWeek() && parsed.hasTask()) {
            return vscode.l10n.t("Add task to entry for week {week}", { week: parsed.week });
        }
        if (parsed.hasTask()) {
            return vscode.l10n.t("Add task to entry {day}", { day: time });
        }
        if (parsed.hasMemo()) {
            return vscode.l10n.t("Add memo to entry {day}", { day: time });
        }

        return vscode.l10n.t("Create or open entry {day}", { day: time });
    }


    private collectScanDirectories(type: JournalPageType): Set<ScopeDirectory> {


        let baseDirectories: ScopeDirectory[] = [];
        this.config.getScopes().forEach(scope => {
            // let dir = this.config.getBasePath(scope); 
            let pattern = "";

            if (type === JournalPageType.entry) {
                pattern = this.config.getEntryPathPattern(scope);
            }
            else if (type === JournalPageType.note) {
                pattern = this.config.getNotesPathPattern(scope);
            }

            // replace base and resolve
            pattern = pattern.replace("${base}", this.config.getBasePath(scope));
            pattern = Path.normalize(pattern);

            // stop when date variables appear in path
            let pathSegments: string[] = pattern.split(Path.sep);
            let filteredSegments: string[] = [];
            for (let segment of pathSegments) {
                if (segment.startsWith("${")) { break; }
                else { filteredSegments.push(segment); }
            }
            const directory = Path.join(...filteredSegments);

            let scopedBaseDirectory: ScopeDirectory = {
                path: directory,
                scope: scope
            };


            if (stringIsNotEmpty(scopedBaseDirectory.path)) {
                if (baseDirectories.findIndex(item => item.path === scopedBaseDirectory.path) === -1) {
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
    public async pickItem(type: JournalPageType): Promise<Input> {
        return new Promise((resolve, reject) => {

            const disposables: vscode.Disposable[] = [];

            try {

                // Fixme, identify scopes while typing and switch base path if needed
                const input: TimedQuickPick = vscode.window.createQuickPick<DecoratedQuickPickItem>();
                input.start = new Date().getTime();
                input.matchOnDescription = true;

                let selected: DecoratedQuickPickItem | undefined;

                input.busy = true;

                // collect directories to scan (including in scopes)
                const directories = this.collectScanDirectories(type);

                this.scanner.getPreviouslyAccessedFiles(this.config.getInputTimeThreshold(), addItemToPickList, input, type, directories);
                input.show();
                input.onDidChangeSelection(sel => {
                    selected = sel[0];
                }, disposables);

                // placeholder only for notes
                if (type === JournalPageType.note) {
                    input.onDidChangeValue(val => {
                        if (val.length === 0) {
                            if (input.items[0].replace && input.items[0].replace === true) {
                                input.items = input.items.slice(1);
                            }
                            return;
                        } else {
                            let inputText = new NoteInput();
                            inputText.text = val;


                            this.parser.resolveNotePathForInput(inputText).then(path => {
                                inputText.path = path;

                                this.logger.debug("Tags in input string: [" + ((inputText.tags.length === 0) ? "" : inputText.tags) + "] and scope " + inputText.scope);

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
                            resolve(selected!.parsedInput!);
                        } else {
                            resolve(new SelectedInput(selected!.path));
                        }

                    } else { reject("cancel"); }
                }, disposables);

            } catch (error) {
                this.logger.error("Failed to pick item", error);
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
        this.logger.trace("Entering getUserInput() in ext/vscode.ts");
        const value = await vscode.window.showInputBox({ prompt: tip });
        if (isNotNullOrUndefined(value) && value!.length > 0) {
            return value!;
        }
        this.logger.debug("User canceled");
        throw new Error("cancel");
    }


    public async saveDocument(textDocument: vscode.TextDocument): Promise<vscode.TextDocument> {
        if (!textDocument.isDirty) { return textDocument; }
        const isSaved = await textDocument.save();
        if (isSaved) { return textDocument; }
        throw new Error("Failed to save file with path: " + textDocument.fileName);
    }



    public async openDocument(path: string | vscode.Uri): Promise<vscode.TextDocument> {
        if (!(path instanceof vscode.Uri)) { path = vscode.Uri.file(path); }
        return vscode.workspace.openTextDocument(path);
    }

    /**
     * Shows the given document in Visual Studio Code
     * 
     * @param {vscode.TextDocument} textDocument the document to show
     * @returns {vscode.TextEditor} the associated text editor
     * @memberOf VsCode
     */
    public async showDocument(textDocument: vscode.TextDocument): Promise<vscode.TextEditor> {
        this.logger.trace("Entering showDocument() in ext/vscode.ts for document: ", textDocument.fileName);

        if (textDocument.isDirty) { textDocument.save(); }

        const existingEditor = vscode.window.visibleTextEditors.find(
            editor => textDocument.fileName.startsWith(editor.document.fileName)
        );
        if (existingEditor) {
            this.logger.debug("Document  ", textDocument.fileName, " is already opened.");
            return existingEditor;
        }

        const col = this.config.isOpenInNewEditorGroup() ? 2 : 1;
        const view = await vscode.window.showTextDocument(textDocument, col, false);

        vscode.commands.executeCommand("cursorMove", {
            to: "down",
            by: "line",
            value: textDocument.lineCount
        });

        this.logger.debug("Showed document  ", textDocument.fileName);
        return view;
    }


    public async showError(error: string | Error): Promise<void> {

        if (isString(error)) {
            this.showErrorInternal(error as string);
        }

        if (isError(error)) {
            this.showErrorInternal((error as Error).message);
        }
    }

    private showErrorInternal(errorMessage: string): void {
        let hint = "Open the logs to see details.";
        vscode.window.showErrorMessage(errorMessage, hint)
            .then(clickedHint => {
                this.logger.showChannel();
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
function addItemToPickList(entries: FileEntry[], input: TimedQuickPick, type: JournalPageType) {

    const items: DecoratedQuickPickItem[] = [];

    entries.forEach(fe => {
        Object.freeze(fe);     // immutable

        if (fe.type !== type) { return; }


        // check if already present
        if (input.items.findIndex(item => fe.path === item.path) >= 0) { return; }

        let displayName = fe.name;

        // if it's a journal page, we prefix the month for visualizing 
        if (type === JournalPageType.entry) {
            let pathItems = fe.path.split(Path.sep);
            displayName = pathItems[pathItems.length - 2] + Path.sep + pathItems[pathItems.length - 1];
        }

        // if it's a note, we denormalize the displayed name
        if (type === JournalPageType.note) {
            displayName = denormalizeFilename(fe.name);
        }

        /* and we prefix the scope (#122) 
        if (fe.scope && fe.scope.length > 0 && fe.scope !== J.VSCode.SCOPE_DEFAULT) {
            fe.name = `#${fe.scope} ${fe.name}`; 
        }*/

        // add icons
        switch (fe.type) {
            case JournalPageType.note: {
                if (fe.scope === SCOPE_DEFAULT) { displayName = `$(circle-large-outline) ${displayName}`; break; }
                else { displayName = `$(circle-large-filled) ${displayName}`; break; }
            }
            case JournalPageType.entry: displayName = `$(clock) ${displayName}`; break;
            case JournalPageType.attachement: displayName = `$(package) ${displayName}`; break;
        }


        // format description
        // if its with the last week, we just print the weekday.. 

        let displayDescription = "";
        try {
            let displayDate = moment(fe.createdAt);

            if (displayDate.isAfter(moment().subtract(7, "d"))) {
                displayDescription += displayDate.format(vscode.l10n.t("[from] dddd"));
            } else {
                displayDescription += displayDate.format(vscode.l10n.t("[from] ll"));
            }
        } catch (error) {
            console.error("Failed to extract date from entry with name: ", displayName, error);
        }
        if (fe.scope !== SCOPE_DEFAULT) {
            displayDescription += ` | #${fe.scope}`;
        }



        let item: DecoratedQuickPickItem = {
            label: displayName,
            path: fe.path,
            fileEntry: fe,
            description: displayDescription
        };
        items.push(item);

    });

    /* Sorted insertion into input.items via binary search (#187): avoids the O(n² log n)
       cost of re-sorting the growing items array on every directory-level callback. */
    if (items.length > 0) {
        const merged = Array.from(input.items);
        for (const item of items) {
            if (!item.fileEntry) {
                merged.push(item);
                continue;
            }
            let lo = 0;
            let hi = merged.length;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                const midEntry = merged[mid].fileEntry;
                // items without fileEntry (the placeholder rows) stay at the front
                if (!midEntry || sortPickEntries(midEntry, item.fileEntry) <= 0) {
                    lo = mid + 1;
                } else {
                    hi = mid;
                }
            }
            merged.splice(lo, 0, item);
        }
        input.items = merged;
    }

    /* Some voodoo to stop the spinner. Since it's a mess to find out when the recursive directory walker is finished, we simply finish after 3 seconds.  */
    if ((input.items.length > 20) || (((new Date().getTime()) - input.start!) > 3000)) {
        input.busy = false;
    }


}