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
import { JournalController, InlineString } from '../../../shared/model/index';

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
 * - insert its open sub-tasks below it (#172), indented relative to the task
 */

export class CopyTaskCommand implements vscode.Command {
    title: string = "Copy selected task";
    command: string = "journal.commands.copy-task";


    protected constructor(public ctrl: JournalController) { }

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: JournalController): vscode.Disposable {
        const cmd = new this(ctrl);
        vscode.commands.registerCommand(cmd.command, (document, range, target, subtasks) => cmd.execute(document, range, target, subtasks));
        return cmd;
    }

    /** @param subtasks lines inserted below the task, e.g. its open sub-tasks (#172) */
    public async execute(document: vscode.TextDocument, text: string, target: ShiftTarget, subtasks: string[] = []) {
        this.ctrl.logger.trace("command called with ", document.uri, ", text ", text, " and target ", target);

        switch (target) {
            case ShiftTarget.nextWorkingDay: return this.insertTaskInNextWorkdDaysEntry(document, text, subtasks);
            case ShiftTarget.today: return this.insertTaskToTodaysEntry(text, subtasks);
            case ShiftTarget.tomorrow: return this.insertTaskToTomorrowsEntry(text, subtasks);
        }
    }

    private async insertTaskInNextWorkdDaysEntry(document: vscode.TextDocument, taskString: string, subtasks: string[]) {
        const entryMoment = moment();

        let dayIncrement = 1;

        if (entryMoment.day() === 5) {
            dayIncrement = 3;
        } else if (entryMoment.day() === 6) {
            dayIncrement = 2;
        }

        return this.insertTaskToEntry(taskString, entryMoment.add(dayIncrement, "d").toDate(), subtasks);
    }

    private async insertTaskToTomorrowsEntry(taskString: string, subtasks: string[]) {
        return this.insertTaskToEntry(taskString, moment().add(1, 'd').toDate(), subtasks);
    }

    private async insertTaskToTodaysEntry(taskString: string, subtasks: string[]) {
        return this.insertTaskToEntry(taskString, moment().toDate(), subtasks);
    }

    private async insertTaskToEntry(taskString: string, date: Date, subtasks: string[]) {
        const entry = await this.ctrl.reader.loadEntryForDay(date);
        const tpl = this.ctrl.config.getTaskInlineTemplate();
        const inlineString: InlineString = await this.ctrl.inject.buildInlineString(entry, tpl, ["${input}", taskString]);
        // the sub-tasks directly below the task, in the same edit
        inlineString.value += subtasks.map((line) => '\n' + line).join('');
        await this.ctrl.inject.injectInlineString(inlineString);
        await this.ctrl.editor.save(entry);
    }



}