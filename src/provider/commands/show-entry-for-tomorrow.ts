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
import { AbstractLoadEntryForDateCommand } from './show-entry-for-date';


export class ShowEntryForTomorrowCommand extends AbstractLoadEntryForDateCommand  {
    title: string = "Show journal entry for tomorrow"
    command: string = "journal.tomorrow"


    public static create(ctrl: J.Util.Ctrl): vscode.Disposable {
        const cmd = new this(ctrl);

        let input = new J.Model.Input();
        input.offset = 1;

        vscode.commands.registerCommand(cmd.command, () => cmd.execute(input));
        return cmd;
    }
}