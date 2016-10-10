'use strict';

import * as vscode from 'vscode';
import Journal from './Journal';

export class Memo {

    constructor(public journal: Journal) {
    }

    public addMemo(): void { /*
        let options: vscode.InputBoxOptions = {
            prompt: "Enter memo"
        };
        vscode.window.showInputBox(options).then(value => {
            let path = vscode.Uri.file(this.journal.getPathForDate(new Date()).get()); 

            // load TextDocument (create if not existing yet)
            this.loadTextDocument(path);    

          

            // issues: Dokument wird geöffnet, das wollen wir eigentlich nicht
            // aktuell wird die Zeile ersetzt, nicht ergänzt

            vscode.workspace.openTextDocument(path).then(textDocument => {
                let content: string = '';

                // check length of file first
                if (textDocument.lineCount == 1) {
                    content += '\n\n';
                } else
                    if (textDocument.lineCount == 2) {
                        content += '\n';
                    }

                // concat memo
                content += '* ';
                content += value;

                let pos = new vscode.Position(3, 0);
                let edit = new vscode.WorkspaceEdit();


                edit.insert((path), pos, content);

                vscode.workspace.applyEdit(edit).then(success => {
                    console.log("Memo added to today's note")
                }, failed => {
                    console.log("Failed to add memo")
                });

            },
                failed => {
                    // today's document doesn't exist yet. Create it first
                }
            );


        });
        */
    }

    private loadOrCreateTextDocument(uri: vscode.Uri): Thenable<vscode.TextDocument> {
   

        return new Promise(exec => {
            vscode.workspace.openTextDocument(uri).then(textDocument => {
                return textDocument; 
            }, 
            failed => {
            // Journal.createToday
            }); 
        }) 
    } 

    private loadTextDocument(uri: vscode.Uri): void {

            // issues: Dokument wird geöffnet, das wollen wir eigentlich nicht
            // aktuell wird die Zeile ersetzt, nicht ergänzt

        vscode.workspace.openTextDocument(uri).then(textDocument => {
            return textDocument; 
        }, 
        failed => {
            // Journal.createToday
        }); 
    }

}