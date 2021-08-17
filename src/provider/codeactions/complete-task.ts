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


/**
 * The complete task codelens is active for open tasks, e.g. '-[ ] some text'
 * 
 * Once activated, it will 
 * - close the task: '-[ ] some text' -> '-[x] some text'
 * - annotate the task with completion date: '-[x] some text (completed on 2021-05-12 at 12:12)'
 */
export class CompleteTaskAction implements vscode.CodeActionProvider {
    private actions: vscode.CodeAction[] = [];
    private ctrl: J.Util.Ctrl; 
    private regex = new RegExp(/-\s{0,1}\[\s{0,2}\].*/g);  
    

    public static readonly providedCodeActionKinds = [
		vscode.CodeActionKind.QuickFix
	];


    constructor(ctrl: J.Util.Ctrl) {
        this.ctrl = ctrl; 
    }

    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
        try {
            if(! this.isOpenTask(document, range)) return; 
            
            this.actions.push(this.createCompleteTaskAction(document, range))
            
            return this.actions; 
        } catch (error) {
            throw new Error(error); 
        }

        

    }
    private createCompleteTaskAction(document: vscode.TextDocument, range: vscode.Range | vscode.Selection): vscode.CodeAction {
        try {
            const fix = new vscode.CodeAction(`Complete this task`, vscode.CodeActionKind.QuickFix);
		    fix.edit = new vscode.WorkspaceEdit();
		    fix.edit.replace(document.uri, new vscode.Range(range.start, range.start.translate(0, 2)), "replaced");
		    return fix;

        } catch (error) {
            throw error; 
        }
    }




    private isOpenTask(document: vscode.TextDocument, range: vscode.Range): boolean {
        return document.lineAt(range.start.line).text.match(this.regex) !== null; 
    }

   
}