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
 * Anything which modifies the text documents goes here. 
 * 
 */
export class Writer {

    constructor(public config: journal.Configuration) {

    }


    /**
     * Adds the given content at the start of text document
     */
    public writeHeader(doc: vscode.TextDocument, content: string): Q.Promise<vscode.TextDocument> {
        return this.writeStringToFile(doc, new vscode.Position(0, 0), content)
    }

    /**
     * Injects the content at the given position. 
     * 
     */
    public writeStringToFile(doc: vscode.TextDocument, pos: vscode.Position, content: string): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();

        let c = pos.line - doc.lineCount;
        // add new lines before injecting (otherwise line count will be ignored) 
        if (c > 0) {
            while (c != 0) {
                content = '\n' + content;
                c++;
            }
            // shift existing content, otherwise it will be replaced    
        } // else if(c>=0) {
        content += '\n';
        //}

        let edit = new vscode.WorkspaceEdit();
        edit.insert(doc.uri, pos, content);

        vscode.workspace.applyEdit(edit).then(success => {
            doc.save().then(() => {
                deferred.resolve(doc);
            }, failed => {
                deferred.reject("Failed to save file");
            })
        }, failed => {
            deferred.reject("Failed to insert memo into file");
        });

        return deferred.promise;
    }


    public writeInputToFile(doc: vscode.TextDocument, pos: vscode.Position, input: journal.Input): Q.Promise<vscode.TextDocument> {
        let content: string = "";
        if (input.flags.match("memo")) {
            content = this.config.getMemoTemplate().replace('{content}', input.memo);
        } else if (input.flags.match("task")) {
            content = this.config.getTaskTemplate().replace('{content}', input.memo);
        }


        return this.writeStringToFile(doc, pos, content);
    }




}