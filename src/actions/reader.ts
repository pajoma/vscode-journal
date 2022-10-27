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
import * as J from '..';

export class Reader {
    constructor(public ctrl: J.Util.Ctrl) {
    }


    /**
  * Returns the page for a day with the given input. If the page doesn't exist yet, 
  * it will be created (with the current date as header) 
  *
  * @param {input} input with offset 0 is today, -1 is yesterday
  * @returns {Q.Promise<vscode.TextDocument>} the document
  * @memberof Reader
  */
    public async loadEntryForInput(input: J.Model.Input): Promise<vscode.TextDocument> {

        if (input.hasOffset()) {
            return this.loadEntryForDay(input.generateDate());
        }
        if (input.hasWeek()) {
            return this.loadEntryForWeek(input.week);
        }
        throw Error("Neither offset nor week are defined in input, we abort.");

    }


    /**
     * Loads the weekly page for the given week number (of the year)
     * @param week the week of the current year
     */
    public async loadEntryForWeek(week: Number): Promise<vscode.TextDocument> {
        return new Promise<vscode.TextDocument>((resolve, reject) => {
            this.ctrl.logger.trace("Entering loadEntryForWeek() in actions/reader.ts for week " + week);

            let path: string = "";

            Promise.all([
                this.ctrl.config.getWeekPathPattern(week),
                this.ctrl.config.getWeekFilePattern(week)

            ]).then(([pathname, filename]) => {
                path = J.Util.resolvePath(pathname.value!, filename.value!);
                return this.ctrl.ui.openDocument(path);

            }).catch((reason: any) => {
                if (reason instanceof Error) {
                    if (!reason.message.startsWith("cannot open file:")) {
                        this.ctrl.logger.printError(reason);
                        reject(reason);
                    }
                }
                return this.ctrl.writer.createWeeklyForPath(path, week);

            }).then((_doc: vscode.TextDocument) => {
                this.ctrl.logger.debug("loadEntryForWeek() - Loaded file in:", _doc.uri.toString());
                resolve(_doc);

            }).catch((error: Error) => {
                this.ctrl.logger.printError(error);
                reject("Failed to load entry for week: " + week);
            });
        });
    }


    /**
     * Loads the journal entry for the given date. If no entry exists, promise is rejected with the invalid path
     *
     * @param {Date} date the date for the entry
     * @returns {Q.Promise<vscode.TextDocument>} the document
     * @throws {string} error message
     * @memberof Reader
     */
     public async loadEntryForDay(date: Date): Promise<vscode.TextDocument> {

        return new Promise<vscode.TextDocument>((resolve, reject) => {
            if (J.Util.isNullOrUndefined(date) || date!.toString().includes("Invalid")) {
                reject("Invalid date");
                return;
            }

            this.ctrl.logger.trace("Entering loadEntryforDate() in actions/reader.ts for date " + date.toISOString());

            let path: string = "";

            Promise.all([
                this.ctrl.config.getResolvedEntryPath(date),
                this.ctrl.config.getEntryFilePattern(date)

            ]).then(([pathname, filename]) => {
                path = J.Util.resolvePath(pathname.value!, filename.value!);
                return this.ctrl.ui.openDocument(path);


            }).catch((reason: any) => {
                if (reason instanceof Error) {
                    if (!reason.message.startsWith("cannot open file:") && !reason.message.startsWith("cannot open vscode-remote:")) {
                        this.ctrl.logger.printError(reason);
                        reject(reason);
                    }
                }
                return this.ctrl.writer.createEntryForPath(path, date);

            }).then((_doc: vscode.TextDocument) => {
                this.ctrl.logger.debug("loadEntryForDate() - Loaded file in:", _doc.uri.toString());
                new J.Provider.SyncNoteLinks(this.ctrl).injectAttachementLinks(_doc, date)
                    .finally(() =>
                        // do nothing
                        this.ctrl.logger.trace("Scanning notes completed")
                    );
                resolve(_doc);

            }).catch((error: Error) => {
                this.ctrl.logger.printError(error);
                reject("Failed to load entry for date: " + date.toDateString());

            });

        });
    }

}


