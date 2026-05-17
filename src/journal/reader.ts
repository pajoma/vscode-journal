// Copyright (C) 2022  Patrick Maué
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
import { IConfiguration, IDialogues, ILogger, IWriter, Input } from '../model';
import { isNullOrUndefined, fileExists } from '../util';
import { resolvePath } from './paths';

export class Reader {
    public onNotesInjected?: (doc: vscode.TextDocument, date: Date) => void;

    constructor(private config: IConfiguration, private logger: ILogger, private writer: IWriter, private ui: IDialogues) {
    }


    /**
  * Returns the page for a day with the given input. If the page doesn't exist yet, 
  * it will be created (with the current date as header) 
  *
  * @param {input} input with offset 0 is today, -1 is yesterday
  * @returns {Q.Promise<vscode.TextDocument>} the document
  * @memberof Reader
  */
    public async loadEntryForInput(input: Input): Promise<vscode.TextDocument> {

        if (input.hasOffset()) {
            return this.loadEntryForDay(input.generateDate(), input.scope);
        }
        if (input.hasWeek()) {
            return this.loadEntryForWeek(input.week, input.scope);
        }
        throw Error("Neither offset nor week are defined in input, we abort.");

    }


    /**
     * Loads the weekly page for the given week number (of the year)
     * @param week the week of the current year
     */
    public async loadEntryForWeek(week: Number, scope?: string): Promise<vscode.TextDocument> {
        this.logger.trace("Entering loadEntryForWeek() in actions/reader.ts for week " + week);

        const [pathname, filename] = await Promise.all([
            this.config.getWeekPathPattern(week, scope),
            this.config.getWeekFilePattern(week, scope),
        ]);
        const path = resolvePath(pathname.value!, filename.value!);

        const doc = await this.openOrCreate(
            path,
            () => this.writer.createWeeklyForPath(path, week),
        );
        this.logger.debug("loadEntryForWeek() - Loaded file in:", doc.uri.toString());
        return doc;
    }


    /**
     * Loads the journal entry for the given date. If no entry exists, it is created.
     *
     * @param {Date} date the date for the entry
     * @returns {Promise<vscode.TextDocument>} the document
     * @memberof Reader
     */
    public async loadEntryForDay(date: Date, scope?: string): Promise<vscode.TextDocument> {
        if (isNullOrUndefined(date) || date!.toString().includes("Invalid")) {
            throw new Error("Invalid date");
        }
        this.logger.trace("Entering loadEntryforDate() in actions/reader.ts for date " + date.toISOString());

        const [pathname, filename] = await Promise.all([
            this.config.getResolvedEntryPath(date, scope),
            this.config.getEntryFilePattern(date, scope),
        ]);
        const path = resolvePath(pathname.value!, filename.value!);

        const doc = await this.openOrCreate(
            path,
            () => this.writer.createEntryForPath(path, date),
        );
        this.logger.debug("loadEntryForDate() - Loaded file in:", doc.uri.toString());

        this.onNotesInjected?.(doc, date);

        return doc;
    }

    private async openOrCreate(
        path: string,
        create: () => Promise<vscode.TextDocument>,
    ): Promise<vscode.TextDocument> {
        const exists = await fileExists(vscode.Uri.file(path));
        if (exists) {
            return this.ui.openDocument(path);
        }
        return create();
    }
}


