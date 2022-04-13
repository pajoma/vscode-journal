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


export class OpenJournalWorkspaceCommand implements vscode.Command, vscode.Disposable {
    title: string = 'Open the journal workspace'; 
    command: string = 'journal.open'; 

     
    protected constructor(public ctrl: J.Util.Ctrl) {}

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: J.Util.Ctrl): vscode.Disposable {
        const cmd = new this(ctrl); 
        vscode.commands.registerCommand(cmd.command, () => cmd.openWorkspace());
        return cmd; 

    }

    /**
     * Called by command 'Journal:open'. Opens a new windows with the Journal base directory as root. 
     *
     * @returns {Q.Promise<void>}
     * @memberof JournalCommands
     */
    public async openWorkspace(): Promise<void> {
        this.ctrl.logger.trace("Executing command: ", this.command);

        let path = vscode.Uri.file(this.ctrl.config.getBasePath());

        try {
            vscode.commands.executeCommand('vscode.openFolder', path, true);
        } catch (error) {
            this.ctrl.logger.error("Failed to execute command: ", this.command, "Reason: ", error);
            this.ctrl.ui.showError("Failed to open the journal workspace.");
        }
    }

}