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
import { DocumentOpener, IConfiguration, IFileSystem, IInject, ILogger } from '../../shared/model/index';

/**
 * Anything which modifies the text documents goes here.
 *
 */
export class Writer {


    constructor(
        private config: IConfiguration,
        private logger: ILogger,
        private inject: IInject,
        private fs: IFileSystem,
        private openDocument: DocumentOpener,
    ) { }

    public async saveDocument(doc: vscode.TextDocument): Promise<vscode.TextDocument> {
        await doc.save();
        return doc;
    }


    /**
     * Adds the given content at the start of text document
     */
    public async writeHeader(doc: vscode.TextDocument, content: string): Promise<vscode.TextDocument> {
        return this.inject.injectString(doc, content, new vscode.Position(0, 0));
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
        this.logger.trace("Entering createEntryForPath() in ext/writer.ts for path: ", path);
        const tpl = await this.config.getEntryTemplate(date);
        const content = tpl.value || "";
        return this.createSaveLoadTextDocument(path, content);
    }

    /**
     * Creates and saves a new file (with configured content) for a weekly entry and returns the associated TextDocument
     *
     * @param {string} path
     * @param {Number} week
     * @returns {Promise<vscode.TextDocument>}
     * @memberof Writer
     */
    public async createWeeklyForPath(path: string, week: Number): Promise<vscode.TextDocument> {
        this.logger.trace("Entering createWeeklyForPath() in ext/writer.ts for path: ", path);
        const tpl = await this.config.getWeeklyTemplate(week);
        const content = tpl.value || "";
        return this.createSaveLoadTextDocument(path, content);
    }

    /**
     * Creates a new file,  adds the given content, saves it and opens it. 
     * 
     * @param {string} path The path in of the new file
     * @param {string} content The preconfigured content of the new file
     * @returns {Promise<vscode.TextDocument>}  The new document associated with the file
     */
    public async createSaveLoadTextDocument(path: string, content: string): Promise<vscode.TextDocument> {

        this.logger.trace("Entering createSaveLoadTextDocument() in ext/writer.ts for path: ", path);

        const fileUri = vscode.Uri.file(path);
        const encoder = new TextEncoder();

        await this.fs.writeFile(path, encoder.encode(content));

        const doc = await this.openDocument(path);
        this.logger.debug("Opened new file with name: ", doc.fileName);
        return doc;

    }

}