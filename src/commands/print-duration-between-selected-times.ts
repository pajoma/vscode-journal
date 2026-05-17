// Copyright (C) 2021  Patrick Maué
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

import moment = require('moment');
import * as vscode from 'vscode';
import * as J from '../..';


export class PrintDurationCommand implements vscode.Command, vscode.Disposable {
    title: string = "Print duration between two selected times";
    command: string = "journal.printDuration";

    protected constructor(public ctrl: J.Util.Ctrl) {}

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: J.Util.Ctrl): vscode.Disposable {
        const cmd = new this(ctrl); 
        vscode.commands.registerCommand(cmd.command, () => cmd.printDuration());
        return cmd; 
    }

    /**
     * Called by command 'Journal:printDuration'. Requires three selections (three active cursors) 
     * in current document. It identifies which of the selections are times (in the format hh:mm 
     *  or glued like "1223") and where to print the duration (in decimal form). 
     * For now the duration is always printing hours. 
     */
    public async printDuration() {
        this.ctrl.logger.trace("Executing command: ", this.command);


        try {
            let editor: vscode.TextEditor = <vscode.TextEditor>vscode.window.activeTextEditor;
            let regExp: RegExp = /\d{1,2}:?\d{0,2}(?:\s?(?:am|AM|pm|PM))?|\s/;
            // let regExp: RegExp = /(\d{1,2}:?\d{2}\s)|(\d{1,4}\s?(?:am|pm)\s)|(\d{1,2}[,\.]\d{1,2}\s)|(\s)/;

            if (editor.selections.length !== 3) {
                throw new Error("To compute the duration, you have to select two times in your text as well as the location where to print it. ");
            }

            // 
            let start: moment.Moment | undefined;
            let end: moment.Moment | undefined;
            let target: vscode.Position | undefined;


            editor.selections.forEach((selection: vscode.Selection) => {
                let range: vscode.Range | undefined = editor.document.getWordRangeAtPosition(selection.active, regExp);


                if (J.Util.isNullOrUndefined(range)) {
                    target = selection.active;
                    return;
                }

                let text = editor.document.getText(range);

                // check if empty string
                if (text.trim().length === 0) {
                    target = selection.active;
                    return;
                }

                // try to format into local date
                let time: moment.Moment = moment(text, "LT");

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
                            text = text.substring(0, mod - 1) + " " + text.substr(mod);
                        }
                        time = moment(text, "hmm A");
                    }
                }

                if (!time.isValid()) {
                    // 2330
                    time = moment(text, "Hmm");
                }

                // parsing glued hours
                if (J.Util.isNullOrUndefined(start)) {
                    start = time;
                } else if (start!.isAfter(time)) {
                    end = start;
                    start = time;
                } else {
                    end = time;
                }
            });

            if (J.Util.isNullOrUndefined(start)) { throw new Error("No valid start time selected"); }  // tslint:disable-line
            else if (J.Util.isNullOrUndefined(end)) { throw new Error("No valid end time selected"); }  // tslint:disable-line
            else if (J.Util.isNullOrUndefined(target)) { throw new Error("No valid target selected for printing the duration."); }  // tslint:disable-line  
            else {
                let duration = moment.duration(start!.diff(end!));
                let formattedDuration = Math.abs(duration.asHours()).toFixed(2);
                this.ctrl.inject.injectString(editor.document, formattedDuration, target!);
            }


        } catch (error) {
            this.ctrl.logger.error("Failed to execute command: ", this.command, "Reason: ", error);
            this.ctrl.ui.showError("Failed to print duration.");
        }

    }

}