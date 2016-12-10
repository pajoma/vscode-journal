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
import * as journal from '.'

/** 
 * Anything which extends Visual Studio Code goes here 
 * 
 */
export class VSCode {
    constructor(public writer: journal.Writer) {

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
                deferred.resolve(value);
            });

        return deferred.promise;
    }

    /**
     * Creates a new file and adds the given content
     */
    public createSaveLoadTextDocument(path: string, content: string): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();
        let uri: vscode.Uri = vscode.Uri.file(path);
        console.log('Journal: ', 'Creating file: ', uri.fsPath);

        uri = vscode.Uri.parse('untitled:'.concat(uri.fsPath));
        vscode.workspace.openTextDocument(uri)
            .then((doc: vscode.TextDocument) => this.writer.writeHeader(doc, content))
            .then((doc: vscode.TextDocument) => {
                deferred.resolve(doc);
            },
            failed => {
                console.log("Failed to create file: ", uri.toString());
                deferred.reject("Failed to create file.");
            }
            );

        return deferred.promise;
    }

    /**
     * Loads a text document from the given path
     */
    public loadTextDocument(path: string): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();
        let uri = vscode.Uri.file(path);

        vscode.workspace.openTextDocument(uri).then(
            deferred.resolve,
            failed => deferred.reject(path) // return path to reuse it later in createDoc
        );

        return deferred.promise;
    }



    public showDocument(textDocument: vscode.TextDocument): Q.Promise<vscode.TextEditor> {
        var deferred: Q.Deferred<vscode.TextEditor> = Q.defer<vscode.TextEditor>();

        vscode.window.showTextDocument(textDocument, 2, false).then(
            view => {
                deferred.resolve(view);
            }, failed => {
                deferred.reject("Failed to show text document");
            });

        return deferred.promise;
    }

}