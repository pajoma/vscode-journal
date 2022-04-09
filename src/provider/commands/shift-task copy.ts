// Copyright (C) 2021  Patrick Maué
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
import * as J from '../..';

export enum ShiftTarget {
    NEXT_DAY,  // the day after the currently active entries date (independent from current date)
    TOMORROW,
    TODAY
}

/**
 * The shift task command is active for open tasks, e.g. '-[ ] some text' and triggered by the codeaction in complete-task
 * 
 * Once activated, it will 
 * - shift the task to the next working day: '-[ ] some text' -> '-[>] some text'
 * - annotate the task with link to new entry: '-[>] some text (copied to [../13.md](2021-05-13))'
 * - insert the task to the entry of the new date: '-[ ] some text (copied from [../12.md](2021-05-12))'
 */

export class ShiftTaskCommand implements vscode.Command {
    title: string = "Shift selected task";
    command: string = "journal.commands.copy-task";


    protected constructor(public ctrl: J.Util.Ctrl) { }

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: J.Util.Ctrl): vscode.Disposable {
        const cmd = new this(ctrl);
        vscode.commands.registerCommand(cmd.command, (document, range, target) => cmd.execute(document, range, target));
        return cmd;
    }

    public async execute(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, target: ShiftTarget) {
        console.log("command called with ", document.uri, "and range", range);
        const taskString: string = "";

        switch (target) {
            case ShiftTarget.NEXT_DAY: this.insertTaskInNextDaysEntry(document, taskString);
            case ShiftTarget.TODAY: this.insertTaskToTodaysEntry(document, taskString);
            case ShiftTarget.TOMORROW: this.insertTaskToTomorrowsEntry(document, taskString);
        }



        return;
    }

    private async insertTaskToTomorrowsEntry(document: vscode.TextDocument, taskString: string) {



        throw new Error('Method not implemented.');
    }

    private async insertTaskToTodaysEntry(document: vscode.TextDocument, taskString: string) {
        throw new Error('Method not implemented.');
    }

    private async insertTaskInNextDaysEntry(document: vscode.TextDocument, taskString: string) {
        let entryDate: Date = await J.Util.getDateFromURIAndConfig(document.uri.toString(), this.ctrl.config);

        let nextDate = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate() + 1);

        console.log("inserting line in new entry for date: ", nextDate);
        throw new Error('Method not implemented.');
    }

}