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


export class ShowNoteCommand implements vscode.Command, vscode.Disposable {
    title: string = 'journal.note'; 
    command: string = 'Loads and shows editor for new note';


    protected constructor(public ctrl: J.Util.Ctrl) { }

    public async dispose(): Promise<void> {
        // do nothing
    }
    
    public static create(ctrl: J.Util.Ctrl): vscode.Disposable {
        const cmd = new this(ctrl); 
        vscode.commands.registerCommand(cmd.command, () => cmd.execute())
        return cmd; 
    }

    /**
     * Creates a new file for a note following the configured pattern
     * Shows the file to let the user start adding notes right away.
     */
    public async execute(): Promise<void> {

        this.ctrl.logger.trace("Executing command: ", this.command);

        try {
            const userInput: string = await this.ctrl.ui.getUserInput("Enter title for new note");
            let parsedInput: J.Model.Input = await this.ctrl.parser.parseInput(userInput); 

            const doc : vscode.TextDocument = await Promise.all([
                this.ctrl.parser.resolveNotePathForInput(parsedInput), 
                this.ctrl.inject.formatNote(parsedInput)
            ]).then(([path, content]) => this.ctrl.reader.loadNote(path, content))
    
            // inject reference to new note in today's journal page
            this.ctrl.reader.loadEntryForInput(new J.Model.Input(0))  // triggered automatically by loading today's page (we don't show it though)
                .catch(reason => this.ctrl.logger.error("Failed to load today's page for injecting link to note.", reason)); 

            await this.ctrl.ui.showDocument(doc); 
        } catch (error) {
            this.ctrl.logger.error("Failed to execute command: ", this.command, "Reason: ", error);
            this.ctrl.ui.showError("Failed to load note.");
        }
    }
}