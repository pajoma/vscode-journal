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
import { ShiftTarget } from '../commands/shift-task';


/**
 * The complete task codelens is active for open tasks, e.g. '-[ ] some text'
 * 
 * Once activated, it will 
 * - close the task: '-[ ] some text' -> '-[x] some text'
 * - annotate the task with completion date: '-[x] some text (completed on 2021-05-12 at 12:12)'
 */
export class OpenTaskActions implements vscode.CodeActionProvider {
    private ctrl: J.Util.Ctrl;
    private regex = new RegExp(/-\s{0,1}\[\s{0,2}\].*/g);


    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];


    constructor(ctrl: J.Util.Ctrl) {
        this.ctrl = ctrl;
    }


    provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.ProviderResult<(vscode.CodeAction)[]> {

        try {
            if (!this.isOpenTask(document, range)) { return; }
            return Promise.all([
                this.createCompleteTaskAction(`Complete this task`, document, range),
                this.createShiftTaskAction(`Copy this task to next day's entry`, document, range, ShiftTarget.nextDay),
                this.createShiftTaskAction(`Copy this task to tomorrow's entry`, document, range, ShiftTarget.tomorrow),
                this.createShiftTaskAction(`Copy this task to today's entry`, document, range, ShiftTarget.today)
            ]
            );
        } catch (error: any) {
            throw new Error(error);
        }
    }

    private async createCompleteTaskAction(description: string, document: vscode.TextDocument, range: vscode.Range | vscode.Selection): Promise<vscode.CodeAction> {
        try {
            const fix = new vscode.CodeAction(description, vscode.CodeActionKind.QuickFix);

            fix.edit = new vscode.WorkspaceEdit();
            fix.edit.replace(document.uri, this.getTaskBoxRange(document, range), "[x]");

            const tpl = await this.ctrl.config.getTimeStringTemplate();

            // FIXME: if current document is not current day, we need to insert also the current date (not only time)

            fix.edit.insert(document.uri, document.lineAt(range.start.line).range.end, " (done: " + tpl.value + ")");

            return fix;

        } catch (error) {
            throw error;
        }
    }

    private async createShiftTaskAction(description: string, document: vscode.TextDocument, range: vscode.Range | vscode.Selection, target: ShiftTarget): Promise<vscode.CodeAction> {
        try {
            const fix = new vscode.CodeAction(description, vscode.CodeActionKind.QuickFix);

            fix.edit = new vscode.WorkspaceEdit();
            fix.edit.replace(document.uri, this.getTaskBoxRange(document, range), "[>]");
            fix.command = { command: "journal.commands.copy-task", title: 'Copy a task', tooltip: 'Copy a task to another entry.', arguments: [document, range, target] };
            return fix;

        } catch (error) {
            throw error;
        }
    }


    private getTaskBoxRange(document: vscode.TextDocument, range: vscode.Range | vscode.Selection): vscode.Range {
        const line: vscode.TextLine = document.lineAt(range.start.line);
        return new vscode.Range(range.start.line, line.text.indexOf("["), range.end.line, line.text.indexOf("]") + 1);
    }



    private isOpenTask(document: vscode.TextDocument, range: vscode.Range): boolean {
        return document.lineAt(range.start.line).text.match(this.regex) !== null;
    }


}