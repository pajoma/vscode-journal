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
import * as J from '../.';
import * as Q from 'q';

/** 
 * Anything which modifies the text documents goes here. 
 * 
 */
export class Writer {


    constructor(public ctrl: J.Util.Ctrl) {
    }

    public async saveDocument(doc: vscode.TextDocument): Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering saveDocument() in actions/writer.ts");
        doc.save(); 
        return doc; 
    }


    /**
     * Adds the given content at the start of text document
     */
    public async writeHeader(doc: vscode.TextDocument, content: string): Promise<vscode.TextDocument> {
        return this.ctrl.inject.injectString(doc, content, new vscode.Position(0, 0));
    }




    /**
     * Creates and saves a new file (with configured content) for a journal entry and returns the associated TextDocument
     *
     * @param {string} path
     * @param {Date} date
     * @returns {Promise<vscode.TextDocument>}
     * @memberof Writer
     */
    public async createEntryForPath(path: string, date: Date): Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering createEntryForPath() in ext/writer.ts for path: ", path);

        try {
            let tpl: J.Provider.HeaderTemplate = await this.ctrl.config.getEntryTemplate(date);
                        
            let content = tpl.value || ""; 
            return this.ctrl.writer.createSaveLoadTextDocument(path, content);

        } catch (error) {
            this.ctrl.logger.error("Error in createEntryForPath() in ext/writer.ts for path: ", path, "Reason: ", error);
            throw error; 
        }
    }

    /**
     * Creates a new file,  adds the given content, saves it and opens it. 
     * 
     * @param {string} path The path in of the new file
     * @param {string} content The preconfigured content of the new file
     * @returns {Thenable<vscode.TextDocument>}  The new document associated with the file
     */
    public async createSaveLoadTextDocument(path: string, content: string): Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering createSaveLoadTextDocument() in ext/writer.ts for path: ", path);
        try {
            // check if file already exists
            let uri: vscode.Uri = vscode.Uri.parse('untitled:' + path);
            let doc: vscode.TextDocument = await this.ctrl.ui.openDocument(uri);
            doc = await this.ctrl.inject.injectHeader(doc, content); 
            doc = await this.ctrl.ui.saveDocument(doc);

            if(doc.isUntitled) {
                this.ctrl.logger.debug("Create new file with name: ", doc.fileName); 
                // open it again, this time not as untitled (since it has been saved)
                doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path));
            }
            return doc; 
        } catch (error) {
            this.ctrl.logger.error("Failed to save or create file: ", path, " with reason: ", error); 
            throw error; 
        }
    }

}