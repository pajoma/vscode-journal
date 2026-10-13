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
import { resolvePath } from '../../shared/paths';

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

        const [pathname, filename] = await Promise.all([
            this.config.getWeekPathPattern(week, year, scope),
            this.config.getWeekFilePattern(week, year, scope),
        ]);
        const path = resolvePath(pathname.value!, filename.value!);

        const entry = await this.openOrCreate(
            path,
            () => this.writer.createWeeklyForPath(path, week, year),
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

        const [pathname, filename] = await Promise.all([
            this.config.getResolvedEntryPath(date, scope),
            this.config.getEntryFilePattern(date, scope),
        ]);
        const path = resolvePath(pathname.value!, filename.value!);

        const entry = await this.openOrCreate(
            path,
            () => this.writer.createEntryForPath(path, date),
        );
        this.logger.debug("loadEntryForDate() - Loaded file in:", entry);

        this.onNotesInjected?.(entry, date);

        return entry;
    }

    /** The path; the file is created first if it does not exist. */
    private async openOrCreate(path: string, create: () => Promise<string>): Promise<string> {
        return (await fileExists(this.fs, path)) ? path : create();
    }
}
