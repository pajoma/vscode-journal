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
import { JournalIndex } from '../../../shared/journal/journal-index';
import { JournalController } from '../../../shared/model/index';
import { CalendarPanel, dayOfJournalFile } from '../calendar-panel';

/** The services this uses of the controller, no more (#320). */
export type OpenCalendarDeps = Pick<JournalController, 'config' | 'editor' | 'fs' | 'logger' | 'reader' | 'ui'>;

/** Journal: Open Calendar (#311): the calendar beside the editor, at the month of the given or the active journal file, else today. */
export class OpenCalendarCommand implements vscode.Disposable {
    command: string = 'journal.openCalendar';

    protected constructor(public ctrl: OpenCalendarDeps, private readonly index: JournalIndex) { }

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: OpenCalendarDeps, index: JournalIndex): vscode.Disposable {
        const cmd = new this(ctrl, index);
        vscode.commands.registerCommand(cmd.command, (year?: number, month?: number) => cmd.execute(year, month));
        return cmd;
    }

    public async execute(year?: number, month?: number): Promise<CalendarPanel | undefined> {
        this.ctrl.logger.trace("Executing command: ", this.command);
        try {
            const active = vscode.window.activeTextEditor?.document.uri;
            const date = year !== undefined && month !== undefined ? new Date(year, month - 1, 1)
                : (active?.scheme === 'file' ? dayOfJournalFile(this.ctrl, active.fsPath) : undefined) ?? new Date();
            return CalendarPanel.show(this.ctrl, this.index, date);
        } catch (error) {
            this.ctrl.logger.error("Failed to execute command: ", this.command, "Reason: ", error);
            this.ctrl.ui.showError("Failed to open the calendar.");
            return undefined;
        }
    }
}
