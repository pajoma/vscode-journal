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

import * as vscode from 'vscode';
import * as J from '../..';


export class PrintSumCommand implements vscode.Command, vscode.Disposable {
    title: string = "Print sum of two selected numbers";
    command: string = "journal.printSum";

    protected constructor(public ctrl: J.Util.Ctrl) {}

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: J.Util.Ctrl): vscode.Disposable {
        const cmd = new this(ctrl); 
        vscode.commands.registerCommand(cmd.command, () => cmd.execute())
        return cmd; 
    }
    /**
        * Prints the sum of the selected numbers in the current editor at the selection location
        */
    public async execute(): Promise<void> {
        this.ctrl.logger.trace("Executing command: ", this.command);


        try {
            let editor: vscode.TextEditor = <vscode.TextEditor>vscode.window.activeTextEditor;
            let regExp: RegExp = /(\d+[,\.]?\d*\s?)|(\s)/;

            let target: vscode.Position;
            let numbers: number[] = [];

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
                // check if number
                let number: number = Number(text);
                if (number > 0) {
                    numbers.push(number);
                    return;
                }

            });

            if (numbers.length < 2) { throw Error("You have to select at least two numbers"); }  // tslint:disable-line
            else if (J.Util.isNullOrUndefined(target!)) { throw Error("No valid target selected for printing the sum."); }  // tslint:disable-line  
            else {
                let result: string = numbers.reduce((previous, current) => previous + current).toString();
                this.ctrl.inject.injectString(editor.document, result + "", target!);
            }
        } catch (error) {
            this.ctrl.logger.error("Failed to execute command: ", this.command, "Reason: ", error);
            this.ctrl.ui.showError("Failed to print sum of selected numbers.");
        }

    }

}