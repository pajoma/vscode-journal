// Copyright (C) 2026  Patrick Maué
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
'use strict';

import * as vscode from 'vscode';
import { parseWikiTarget } from 'journal-core';
import { JournalController } from '../../../shared/model/index';

/** Opens the daily entry of a day (`2026-10-20`), created if missing; run by the previous/next CodeLens of daily entries (#311). */
export class OpenDayCommand implements vscode.Disposable {
    command: string = 'journal.openDay';

    protected constructor(public ctrl: JournalController) { }

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: JournalController): vscode.Disposable {
        const cmd = new this(ctrl);
        vscode.commands.registerCommand(cmd.command, (day: string) => cmd.execute(day));
        return cmd;
    }

    public async execute(day: string): Promise<string | undefined> {
        this.ctrl.logger.trace("Executing command: ", this.command, day);
        try {
            const target = parseWikiTarget(day);
            if (target.kind !== 'day') { throw new Error(`Not a day: ${day}`); }
            const path = await this.ctrl.reader.loadEntryForDay(new Date(target.year, target.month - 1, target.day));
            await this.ctrl.editor.show(path);
            return path;
        } catch (error) {
            this.ctrl.logger.error("Failed to execute command: ", this.command, "Reason: ", error);
            this.ctrl.ui.showError("Failed to open the entry.");
            return undefined;
        }
    }
}
