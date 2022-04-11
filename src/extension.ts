// Copyright (C) 2018  Patrick Maué
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
import * as J from './';

export var journalStartup: J.Extension.Startup;
export var journalConfiguration: J.Extension.Configuration; 

export function activate(context: vscode.ExtensionContext) {

    try {
        console.time("startup");

        let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
        journalStartup = new J.Extension.Startup(config);
        journalStartup.run(context); 
        
        // return public API of this extension
        return {
            getJournalConfiguration() {
                return journalStartup.getJournalController().config; 
            }
        };
    } catch (error) {
        console.error("Failed to start journal extension with reason: ", error); 
        throw error; 
    }

}


// this method is called when your extension is deactivated
export function deactivate() {
}




