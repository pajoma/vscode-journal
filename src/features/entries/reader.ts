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

import { IFileSystem, ILogger, IWriter, Input } from '../../shared/model/index';
import { JournalPaths } from 'journal-core';
import { isNullOrUndefined } from '../../shared/lang';
import { fileExists } from '../../shared/fs/fs-exists';

export class Reader {
    public onNotesInjected?: (path: string, date: Date) => void;

    constructor(
        private config: JournalPaths,
        private logger: ILogger,
        private writer: IWriter,
        private fs: IFileSystem,
    ) { }


    /**
  * Returns the page for a day with the given input. If the page doesn't exist yet, 
  * it will be created (with the current date as header) 
  *
  * @param {input} input with offset 0 is today, -1 is yesterday
  * @returns the path of the entry
  * @memberof Reader
  */
    public async loadEntryForInput(input: Input): Promise<string> {

        if (input.hasOffset()) {
            return this.loadEntryForDay(input.generateDate(), input.scope);
        }
        if (input.hasWeek()) {
            return this.loadEntryForWeek(input.week, input.weekYear, input.scope);
        }
        throw Error("Neither offset nor week are defined in input, we abort.");

    }


    /**
     * Loads the weekly page for the given week number (of the year)
     * @param week the week number
     * @param year the year the week belongs to (not the calendar year around New Year)
     */
    public async loadEntryForWeek(week: number, year: number, scope?: string): Promise<string> {
        this.logger.trace("Entering loadEntryForWeek() in actions/reader.ts for week " + week);

        const entry = await this.openOrCreate(
            this.config.getWeekPaths(week, year, scope),
            path => this.writer.createWeeklyForPath(path, week, year),
        );
        this.logger.debug("loadEntryForWeek() - Loaded file in:", entry);
        return entry;
    }


    /**
     * Loads the journal entry for the given date. If no entry exists, it is created.
     *
     * @param {Date} date the date for the entry
     * @returns the path of the entry
     * @memberof Reader
     */
    public async loadEntryForDay(date: Date, scope?: string): Promise<string> {
        if (isNullOrUndefined(date) || date!.toString().includes("Invalid")) {
            throw new Error("Invalid date");
        }
        this.logger.trace("Entering loadEntryforDate() in actions/reader.ts for date " + date.toISOString());

        const entry = await this.openOrCreate(
            this.config.getEntryPaths(date, scope),
            path => this.writer.createEntryForPath(path, date),
        );
        this.logger.debug("loadEntryForDate() - Loaded file in:", entry);

        this.onNotesInjected?.(entry, date);

        return entry;
    }

    /**
     * The first of the candidate paths (one per layout, #309) that exists;
     * else the file is created at the first one, the current layout. A file
     * written before the patterns changed is opened where it is, never a
     * second one created.
     */
    private async openOrCreate(candidates: string[], create: (path: string) => Promise<string>): Promise<string> {
        for (const path of candidates) {
            if (await fileExists(this.fs, path)) { return path; }
        }
        return create(candidates[0]);
    }
}
