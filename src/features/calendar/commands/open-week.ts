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
import { weekOf } from 'journal-core';
import { JournalController } from '../../../shared/model/index';
import { dayOfJournalFile } from '../calendar-panel';

/** Journal: Open Week (#311): the weekly entry of the given week, else of the active journal file, else of today; created if missing. */
export class OpenWeekCommand implements vscode.Disposable {
    command: string = 'journal.openWeek';

    protected constructor(public ctrl: JournalController) { }

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: JournalController): vscode.Disposable {
        const cmd = new this(ctrl);
        vscode.commands.registerCommand(cmd.command, (week?: number, year?: number) => cmd.execute(week, year));
        return cmd;
    }

    public async execute(week?: number, year?: number): Promise<string | undefined> {
        this.ctrl.logger.trace("Executing command: ", this.command);
        try {
            if (week === undefined || year === undefined) {
                const active = vscode.window.activeTextEditor?.document.uri;
                const day = (active?.scheme === 'file' ? dayOfJournalFile(this.ctrl, active.fsPath) : undefined) ?? new Date();
                ({ week, year } = weekOf(day, this.ctrl.config.getLocale()));
            }
            const path = await this.ctrl.reader.loadEntryForWeek(week, year);
            await this.ctrl.editor.show(path);
            return path;
        } catch (error) {
            this.ctrl.logger.error("Failed to execute command: ", this.command, "Reason: ", error);
            this.ctrl.ui.showError("Failed to open the weekly entry.");
            return undefined;
        }
    }
}
