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
import * as journal from '.';
import * as Q from 'q';

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
                if (value && value.length > 0) {
                    deferred.resolve(value);
                } else {
                    // user canceled
                    deferred.reject("cancel");
                }


            });

        return deferred.promise;
    }

    public getUserInputCombo(tip: string, items: Q.Promise<[journal.PickDayItem]>): Q.Promise<string> {
        let deferred: Q.Deferred<string> = Q.defer<string>();

        let options: vscode.QuickPickOptions = {
            placeHolder: tip
        }

        console.log(JSON.stringify(items));


        vscode.window.showQuickPick(items, options)
            .then((picked: journal.PickDayItem) => {
                if (picked) {
                    deferred.resolve(picked.label);
                } else {
                    // user canceled
                    deferred.reject("cancel");
                }
            });

        return deferred.promise;
    }

    public getUserInputComboSync(tip: string, items: [journal.PickDayItem]): Q.Promise<string> {
        let deferred: Q.Deferred<string> = Q.defer<string>();

        let options: vscode.QuickPickOptions = {
            placeHolder: tip

        }


        vscode.window.showQuickPick(items, options)
            .then((picked: journal.PickDayItem) => {
                if (picked) {
                    deferred.resolve(picked.label);
                } else {
                    // user canceled
                    deferred.reject("cancel");
                }
            });

        return deferred.promise;
    }


    /**
     * Creates a new file and adds the given content
     */
    public createSaveLoadTextDocument(path: string, content: string): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();
        


        let uri:vscode.Uri = vscode.Uri.parse('untitled:'+path);
        vscode.workspace.openTextDocument(uri)
            .then((doc: vscode.TextDocument) => this.writer.writeHeader(doc, content))
            .then((doc: vscode.TextDocument) => {
                if(doc.isUntitled) {
                    // open it again, this time not as untitled (since it has been saved)
                    vscode.workspace.openTextDocument(vscode.Uri.file(path))
                        .then(deferred.resolve)
                } else {
                    deferred.resolve(doc); 
                }
                
                console.log('[Journal]', 'Created file: ', doc.uri.toString());
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
            success => {
                deferred.resolve(success)
            },
            failed => {
                deferred.reject(path) // return path to reuse it later in createDoc     
            }
        );

        return deferred.promise;
    }



    public showDocument(textDocument: vscode.TextDocument): Q.Promise<vscode.TextEditor> {
        var deferred: Q.Deferred<vscode.TextEditor> = Q.defer<vscode.TextEditor>();

        if(textDocument.isDirty) textDocument.save(); 

        vscode.window.showTextDocument(textDocument, 2, false).then(
            view => {
                console.log("[Journal]", "Showed file:", textDocument.uri.toString());
                
                deferred.resolve(view);
            }, failed => {
                deferred.reject("Failed to show text document");
            });

        return deferred.promise;
    }

}