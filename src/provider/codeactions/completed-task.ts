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
export class CompletedTaskActions implements vscode.CodeActionProvider {
    private ctrl: J.Util.Ctrl; 
    private regex = new RegExp(/-\s{0,1}\[\s{0,2}x|X\s{0,2}\].*/g);  
    

    public static readonly providedCodeActionKinds = [
		vscode.CodeActionKind.QuickFix
	];


    constructor(ctrl: J.Util.Ctrl) {
        this.ctrl = ctrl; 
    }

    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
        try {
            if(! this.matchesExpression(document, range)) return; 
            return Promise.all([
                this.createReinstateTask(document, range)
                ]
            ); 
        } catch (error) {
            throw new Error(error); 
        }
    }


    private createReinstateTask(document: vscode.TextDocument, range: vscode.Range | vscode.Selection): vscode.CodeAction {
        try {
            const fix = new vscode.CodeAction(`Open this task again`, vscode.CodeActionKind.QuickFix);

		    fix.edit = new vscode.WorkspaceEdit();
		    fix.edit.replace(document.uri, this.getTaskBoxRange(document, range) , "[ ]");
            fix.edit.delete(document.uri, this.getAnnotationRange(document, range))
		    return fix;

        } catch (error) {
            throw error; 
        }
    }

    private getAnnotationRange(document: vscode.TextDocument, range: vscode.Range | vscode.Selection): vscode.Range {
        const line: vscode.TextLine = document.lineAt(range.start.line); 
        const start: number = line.text.indexOf(" (done: "); 
        const end: number = line.text.substr(start).indexOf(")")+start+1; 
        return new vscode.Range(range.start.line, start, range.end.line, end); 

    }
    private getTaskBoxRange(document: vscode.TextDocument, range: vscode.Range | vscode.Selection ): vscode.Range {
        const line: vscode.TextLine = document.lineAt(range.start.line); 
        return new vscode.Range(range.start.line, line.text.indexOf("["), range.end.line,line.text.indexOf("]")+1); 
    }
    


    private matchesExpression(document: vscode.TextDocument, range: vscode.Range): boolean {
        return document.lineAt(range.start.line).text.match(this.regex) !== null; 
    }


   
}