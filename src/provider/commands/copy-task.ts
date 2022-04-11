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

import moment = require('moment');
import * as vscode from 'vscode';
import * as J from '../..';

export enum ShiftTarget {
    nextWorkingDay,  
    tomorrow,
    today, 
    successorDay // the day after the currently active entries date (independent from current date)
}

/**
 * The shift task command is active for open tasks, e.g. '-[ ] some text' and triggered by the codeaction in complete-task
 * 
 * Once activated, it will 
 * - shift the task to the next working day: '-[ ] some text' -> '-[>] some text'
 * - annotate the task with link to new entry: '-[>] some text (copied to [../13.md](2021-05-13))'
 * - insert the task to the entry of the new date: '-[ ] some text (copied from [../12.md](2021-05-12))'
 */

export class CopyTaskCommand implements vscode.Command {
    title: string = "Copy selected task";
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

    public async execute(document: vscode.TextDocument, text: string, target: ShiftTarget) {
        this.ctrl.logger.trace("command called with ", document.uri, ", text ", text, " and target ", target);

        switch (target) {
            case ShiftTarget.nextWorkingDay: return this.insertTaskInNextWorkdDaysEntry(document, text);
            case ShiftTarget.today: return this.insertTaskToTodaysEntry(text);
            case ShiftTarget.tomorrow: return this.insertTaskToTomorrowsEntry(text);
        }
    }

    private async insertTaskInNextWorkdDaysEntry(document: vscode.TextDocument, taskString: string) {
        // const entryDate: Date = await J.Util.getDateFromURIAndConfig(document.uri.toString(), this.ctrl.config);
        const entryMoment = moment(); 

        let dayIncrement = 1;

        if (entryMoment.day() === 5) {
          dayIncrement = 3;
        } else if (entryMoment.day() === 6) {
          dayIncrement = 2;
        }

        this.insertTaskToEntry(taskString, entryMoment.add(dayIncrement, "d").toDate());
    }

    private async insertTaskToTomorrowsEntry(taskString: string) {
        this.insertTaskToEntry(taskString, moment().add(1, 'd').toDate());
    }

    private async insertTaskToTodaysEntry(taskString: string) {
        this.insertTaskToEntry(taskString, moment().toDate());
    }

    private async insertTaskToEntry(taskString: string, date: Date) {
        const doc : vscode.TextDocument = await this.ctrl.reader.loadEntryForDay(date); 
        const tpl : J.Model.InlineTemplate = await this.ctrl.config.getTaskInlineTemplate();
        const pos = this.ctrl.inject.computePositionForInput(doc, tpl); 
        const inlineString: J.Model.InlineString = await this.ctrl.inject.buildInlineString(doc, tpl, ["${input}", taskString]); 
        this.ctrl.inject.injectInlineString(inlineString);

        doc.save(); 
    }



}