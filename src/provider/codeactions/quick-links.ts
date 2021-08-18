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
 * The complete task codelens is active manuelly entered quick links
 * 
 * See description in #15
 * 
 * Sequence
 * - User enters: a file link to [[workshop notes]]
 * - Code Action triggered: Create note and transform to link
 * - [[workshop notes]] is transformed to [workshop-notes](../notes/202108-workshop-notes.md). The file name follows the pattern in the configuration
 * - A new file is created with the title # Workshop Notes
 * 
 * 
 */
export class QuickLinkActions implements vscode.CodeActionProvider {

    // private ctrl: J.Util.Ctrl; 
    private regex = new RegExp(/\[\[[\w\s\d]+\]\].*/g);  

    // FIXME: check if this is properly carried over to resolve action
    private document: vscode.TextDocument | undefined; 
    private range: vscode.Range | vscode.Selection | undefined; 


    provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
            if(! this.matchesExpression(document, range)) return; 
            
            this.document = document; 
            this.range = range; 
            return [new vscode.CodeAction(`Convert to proper link and create linked file.`, vscode.CodeActionKind.Refactor)]; 
    }

    resolveCodeAction?(fix: vscode.CodeAction, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeAction> {
        try {

		    fix.edit = new vscode.WorkspaceEdit();

            // 1. resolve file using magic input scanner

            // 2. construct uri of file

            // 3. create file

            // 4. replace text

            
		    //fix.edit.replace(document.uri, this.getAffectedRange(document, range) , "[>]");
            //fix.edit.createFile()

            
		    return fix;

        } catch (error) {
            throw error; 
        }
    }




    private matchesExpression(document: vscode.TextDocument, range: vscode.Range): boolean {
        return document.lineAt(range.start.line).text.match(this.regex) !== null; 
    }


    private getAffectedRange(document: vscode.TextDocument, range: vscode.Range | vscode.Selection ): vscode.Range {
        const line: vscode.TextLine = document.lineAt(range.start.line); 
        return new vscode.Range(range.start.line, line.text.indexOf("["), range.end.line,line.text.indexOf("]")+1); 
    }
}