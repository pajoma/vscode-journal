// Copyright (C) 2016  Patrick Maué
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
import Journal from './journal';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('vscode-journal is now active!');

    let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
    let journal = new Journal(config);


    context.subscriptions.push(
        vscode.commands.registerCommand('journal.today', () => {
            journal.openDay(0).catch(error => vscode.window.showErrorMessage(error));
        }),
        vscode.commands.registerCommand('journal.entry', () => {
            journal.addEntry().catch(error => vscode.window.showErrorMessage(error));
        }),
        vscode.commands.registerCommand('journal.yesterday', () => {
            journal.openDay(-1).catch(error => vscode.window.showErrorMessage(error));
        }),
        vscode.commands.registerCommand('journal.tomorrow', () => {
            journal.openDay(1).catch(error => vscode.window.showErrorMessage(error));
        }),
        vscode.commands.registerCommand('journal.day', () => {
            journal.openDayByInput().catch(error => vscode.window.showErrorMessage(error));
        }),
        vscode.commands.registerCommand('journal.memo', () => {
            journal.openDayByInput().catch(error => vscode.window.showErrorMessage(error));
        }),
        vscode.commands.registerCommand('journal.note', () => {
            journal.createNote().catch(error => vscode.window.showErrorMessage(error));
        }),
        vscode.commands.registerCommand('journal.open', () => {
            journal.openJournal().catch(error => vscode.window.showErrorMessage(error));
        }),


    );


    /* some dev features (stuff where we are waiting for updates in the extension API)
    if (journal.getConfig().isDevEnabled()) {
        context.subscriptions.push(
            vscode.commands.registerCommand('journal.test', function () {
                // The code you place here will be executed every time your command is executed

                function delayedQuickPickItems() {
                    return new Promise((resolve, reject) => {
                        setTimeout(() => resolve(['aaaa', 'bbbb', 'cccc', 'abc', 'bcd']), 2000)
                    })
                }

                // Display a message box to the user
                vscode.window.showQuickPick(delayedQuickPickItems()).then(x => vscode.window.showInformationMessage(x))
            }),
            vscode.commands.registerCommand('journal.day2', () => {
                journal.openDayByInputOrSelection().catch(error => vscode.window.showErrorMessage(error));
            })
        );
    } */


}


// this method is called when your extension is deactivated
export function deactivate() {
}

