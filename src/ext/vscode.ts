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
import * as Path from 'path';
import * as J from './..'

/** 
 * Anything which extends Visual Studio Code goes here 
 * 
 */
export class VSCode {
    constructor(public ctrl: J.Util.Ctrl) {

    }

    /** 
     * Simple method to have Q Promise for vscode API call to get user input 
     */
    public getUserInput(tip: string): Q.Promise<string> {
        let deferred: Q.Deferred<string> = Q.defer<string>();

        let options: vscode.InputBoxOptions = {
            prompt: tip
        };

        vscode.window.showInputBox(options)
            .then((value: string) => {
                if (value && value.length > 0) {
                    deferred.resolve(value);
                } else {
                    // user canceled
                    deferred.reject("cancel");
                }


            });

        return deferred.promise;
    }











    public showDocument(textDocument: vscode.TextDocument): Q.Promise<vscode.TextEditor> {
        var deferred: Q.Deferred<vscode.TextEditor> = Q.defer<vscode.TextEditor>();

        if (textDocument.isDirty) textDocument.save();

        let col = this.ctrl.config.isOpenInNewEditorGroup() ? 2 : 1;

        vscode.window.showTextDocument(textDocument, col, false).then(
            view => {
                console.log("[Journal]", "Showed file:", textDocument.uri.toString());

                // move cursor always to end of file
                vscode.commands.executeCommand("cursorMove", {
                    to: "down",
                    by: "line",
                    value: textDocument.lineCount
                });

                deferred.resolve(view);
            }, failed => {
                deferred.reject("Failed to show text document");
            });

        return deferred.promise;
    }



}