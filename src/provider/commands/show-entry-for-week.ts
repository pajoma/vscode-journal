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
import moment = require("moment");
import { AbstractLoadEntryForDateCommand } from './show-entry-for-date';

class AbstractShowEntryForWeekCommand extends AbstractLoadEntryForDateCommand {
    protected constructor(public ctrl: J.Util.Ctrl, public offset: number) {
        super(ctrl);
    }

    public override async execute(input: J.Model.Input): Promise<void> {
        let editor: vscode.TextEditor = <vscode.TextEditor>vscode.window.activeTextEditor;
        let currentWeek = moment().week();
        if (this.offset !== 0) {
            let filepattern = this.ctrl.config.getPatternDefinitions().weeks.file;
            let filename = editor.document.fileName.split('/').pop()!;
            let values = this.extractValueByPattern(filepattern, filename);
            if (!isNaN(parseInt(values["week"]))) {
                currentWeek = parseInt(values["week"]);
            }
            currentWeek += this.offset;
        }
        input.week = currentWeek;
        super.execute(input);
    }

    /**
     * Extracts values from a filename based on a given file pattern.
     * 
     * @param {string} filepattern - 'week_${week}.${ext}'.
     * @param {string} filename -  'week_21.md'.
     * @returns {Record<string, string>} - { week: "21", ext: "md" }
     */
    extractValueByPattern(filepattern: string, filename: string) {
        const regexPattern = filepattern.replace(/\$\{(\w+)\}/g, '(?<$1>\\w+)');
        const regex = new RegExp(regexPattern);

        const match = filename.match(regex);
        let extractedValues: Record<string, string> = {};
        if (match) {
            for (let group in match.groups) {
                extractedValues[group] = match.groups[group];
            }
        }
        return extractedValues;
    }

}

export class ShowEntryForCurrentWeekCommand extends AbstractShowEntryForWeekCommand {
    title: string = "Show journal entry for current week";
    command: string = "journal.current.week";


    public static create(ctrl: J.Util.Ctrl): vscode.Disposable {
        const cmd = new this(ctrl, 0);

        let input = new J.Model.Input();

        vscode.commands.registerCommand(cmd.command, () => cmd.execute(input));
        return cmd;
    }

}

export class ShowEntryForNextWeekCommand extends AbstractShowEntryForWeekCommand {
    title: string = "Show journal entry for next week";
    command: string = "journal.next.week";


    public static create(ctrl: J.Util.Ctrl): vscode.Disposable {
        const cmd = new this(ctrl, +1);

        let input = new J.Model.Input();
        input.week = 1;

        vscode.commands.registerCommand(cmd.command, () => cmd.execute(input));
        return cmd;
    }

}

export class ShowEntryForPreviousWeekCommand extends AbstractShowEntryForWeekCommand {
    title: string = "Show journal entry for previous week";
    command: string = "journal.previous.week";


    public static create(ctrl: J.Util.Ctrl): vscode.Disposable {
        const cmd = new this(ctrl, -1);

        let input = new J.Model.Input();
        input.week = -1;

        vscode.commands.registerCommand(cmd.command, () => cmd.execute(input));
        return cmd;
    }

}