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
import * as J from '../.';

export class JournalCodeLensProvider implements vscode.CodeLensProvider {
    private codeLenses: vscode.CodeLens[] = [];
    private ctrl: J.Util.Ctrl; 

    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    


    constructor(ctrl: J.Util.Ctrl) {
        this.ctrl = ctrl; 

        vscode.workspace.onDidChangeConfiguration((_) => {
            this._onDidChangeCodeLenses.fire();
        });
    }

    async getRegex() : Promise<RegExp> {
        let template = await this.ctrl.config.getTaskInlineTemplate(); 
        return new RegExp(template.after);
    }

    public async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
            this.codeLenses = [];
            const regex = await this.getRegex(); 
            const text = document.getText();
            const matches = regex.exec(text); 

            if(matches !== null) {
                const line = document.lineAt(document.positionAt(matches.index).line);
                const indexOf = line.text.indexOf(matches[0]);
                const position = new vscode.Position(line.lineNumber, indexOf);
                const range = document.getWordRangeAtPosition(position, regex);
                if (range) {
                    this.codeLenses.push(new vscode.CodeLens(range));
                }
            }
            
            return this.codeLenses;
    }

    public resolveCodeLens?(codeLens: vscode.CodeLens, token: vscode.CancellationToken):
    vscode.CodeLens | Thenable<vscode.CodeLens> {


        codeLens.command = {
            title: "Collect all tasks",
            tooltip: "Collect and modify tasks from this and previous journal entries",
            command: "codelens-sample.codelensAction",
            arguments: ["Argument 1", false]
        };
        return codeLens;
    }
}