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
import * as fs from 'fs'
import * as Q from 'q';

/** 
 * Anything which modifies the text documents goes here. 
 * 
 */
export class Writer {

    private cleanedUpFirstLine: boolean = false; 

    constructor(public config: journal.Configuration) {
    }


    /**
     * Adds the given content at the start of text document
     */
    public writeHeader(doc: vscode.TextDocument, content: string): Q.Promise<vscode.TextDocument> {
        return this.writeStringToFile(doc, content, new vscode.Position(0, 0));
    }

    /**
     * Inserts the content as new line after the given string
     * @param doc 
     * @param after 
     * @param content 
     */
    public addLineAfter(doc: vscode.TextDocument, after: string, content: string): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();

        return deferred.promise;
    }

    public insertContent(doc: vscode.TextDocument, tpl: journal.TemplateInfo, ...values: string[][]): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();

        Q.fcall(() => {
            // construct content to insert
            let content: string = tpl.Template;
            values.forEach((val: string[]) => {
                content = content.replace(val[0], val[1]);
            })

            // if (tpl-after) is empty, we will inject directly after header
            let position: vscode.Position = null; 
            if (tpl.After.length == 0) {
                return [content, position]; 
            } else {
                let offset: number = doc.getText().indexOf(tpl.After);
                // if after string is not found, we default to after header
                if(offset > 0) {
                    position = doc.validatePosition(doc.positionAt(offset).translate(1,0)); 
                } 
                return [content, position]; 
                
            }
        }).then(values => {
            return this.writeStringToFile(doc, <string>values[0], <vscode.Position>values[1]); 
        } )
        .then(() => {
            deferred.resolve(doc); 
        }); 
        return deferred.promise;
    }


    /**
     * Injects the content at the given position. 
     * 
     */
    public writeStringToFile(doc: vscode.TextDocument, content: string, pos?: vscode.Position): Q.Promise<vscode.TextDocument> {
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
            if(saved) deferred.resolve(doc);
            else deferred.reject("Failed to save file"); 
        })
        .catch((err) => {
            deferred.reject(err);
        });

        return deferred.promise;
    }


    public writeInputToFile(doc: vscode.TextDocument, pos: vscode.Position, input: journal.Input): Q.Promise<vscode.TextDocument> {
        let content: string = "";
        if (input.flags.match("memo")) {
            content = this.config.getMemoTemplate().replace('{content}', input.memo);
            return this.writeStringToFile(doc, content, pos);
        } else if (input.flags.match("task")) {
            return this.insertContent(doc, this.config.getTaskTemplate(), ["{content}", input.memo]); 
        } else if (input.flags.match("todo")){
            return this.insertContent(doc, this.config.getTodoTemplate(), ["{content}", input.memo]);
        }
        
    }




}