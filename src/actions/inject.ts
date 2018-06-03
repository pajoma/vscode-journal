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
import * as J from '../.';

export class Inject {

    private cleanedUpFirstLine: boolean = false;

    constructor(public ctrl: J.Util.Ctrl) {

    }


    /**
     * Adds a new memo to today's page. A memo is a one liner (entered in input box), 
     * which can be used to quickly write down ToDos without leaving your current 
     * document.
     */
    public injectInput(doc: vscode.TextDocument, input: J.Model.Input): Q.Promise<vscode.TextDocument> {

        return Q.Promise<vscode.TextDocument>((resolve, reject) => {
            if (!input.hasMemo() || !input.hasFlags()) resolve(doc);
            else {
                this.ctrl.writer.writeInputToFile(doc, new vscode.Position(2, 0), input)
                    .then(doc => resolve(doc))
                    .catch(error => reject(error));
            }
        });
    }

    public injectInlineTemplate(doc: vscode.TextDocument, tpl: J.Extension.InlineTemplate, ...values: string[][]): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();

        Q.fcall(() => {
            // construct content to insert
            let content: string = tpl.template;
            values.forEach((val: string[]) => {
                content = content.replace(val[0], val[1]);
            })

            // if (tpl-after) is empty, we will inject directly after header
            let position: vscode.Position = null;
            if (tpl.after.length == 0) {
                return [content, position];
            } else {
                let offset: number = doc.getText().indexOf(tpl.after);
                
                // if after string is not found, we default to after header
                if (offset > 0) {
                    position = doc.validatePosition(doc.positionAt(offset).translate(1, 0));
                }
                return [content, position];

            }
        }).then(values => {
            
            
            return this.injectString(doc, <string>values[0], <vscode.Position>values[1]);
           
        })
            .then(() => {
                //J.Util.debug("Injected link to ", values[1][1], " in ", doc.fileName); 
                deferred.resolve(doc);
            });
        return deferred.promise;
    }

    /**
     * Injects the string at the given position. 
     * 
     */
    public injectString(doc: vscode.TextDocument, content: string, pos?: vscode.Position): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();


        Q.fcall(() => {

            if (pos == null) {
                pos = new vscode.Position(2, 0);

                // we need to have an empty line between header and content, if there's some content we need to shift a line
                if (!doc.lineAt(1).isEmptyOrWhitespace && !this.cleanedUpFirstLine) {
                    let edit = new vscode.WorkspaceEdit();
                    edit.insert(doc.uri, new vscode.Position(1, 0), '\n');
                    vscode.workspace.applyEdit(edit);
                    // flip toggle (we only want to have this once)
                    this.cleanedUpFirstLine = true;
                }
            }
        })
            .then(() => {
                let edit = new vscode.WorkspaceEdit();
                edit.insert(doc.uri, pos, content + '\n');
                return edit;
            })
            .then(vscode.workspace.applyEdit)
            .then(doc.save)
            .then((saved: boolean) => {
                this.cleanedUpFirstLine = false;
                if (saved) deferred.resolve(doc);
                else deferred.reject("Failed to save file");
            })
            .catch((err) => {
                deferred.reject(err);
            });

        return deferred.promise;
    }

    public synchronizeReferencedFiles(doc: vscode.TextDocument): void {
        // we invoke the scan of the notes directory in paralell
        Q.all([
            this.ctrl.reader.getReferencedFiles(doc),
            this.ctrl.reader.getFilesInNotesFolder(doc)
        ]).then(results => {
            // for each file, check wether it is in the list of referenced files
            let referencedFiles: string[] = results[0];
            let foundFiles: string[] = results[1];

            foundFiles.forEach((file, index, array) => {
                let m: string = referencedFiles.find(match => match == file);
                if (m == null) {
                    if (this.ctrl.config.isDevelopmentModeEnabled()) J.Util.debug("File link not present in entry: ",  file);

                    // construct local reference string
                    this.ctrl.config.getFileLinkInlineTemplate()
                        .then(tpl => {
                            this.injectInlineTemplate(
                                doc, 
                                tpl,
                                ["${title}", J.Util.denormalizeFilename(file, this.ctrl.config.getFileExtension())],
                                ["${link}", "./" + J.Util.getFileInURI(doc.uri.path) + "/" + file]
                            );    
                        }); 

                   
                }
            }); 

            //console.log(JSON.stringify(results));
        }).catch((err) => {
            let msg = 'Failed to synchronize page with notes folder. Reason: ' + err;
            vscode.window.showErrorMessage(msg);
        })
    }

}