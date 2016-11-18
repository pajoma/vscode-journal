'use strict';

import * as vscode from 'vscode';
import Journal from './journal'; 

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('vscode-journal is now active!');

    let config:vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
    let journal = new Journal(config); 
    

    context.subscriptions.push(
        vscode.commands.registerCommand('journal.today', () => {
            journal.openDay(0); 
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
            journal.addMemo().catch(error => vscode.window.showErrorMessage(error));
        }),
        vscode.commands.registerCommand('journal.note', () => {
            journal.createNote().catch(error => vscode.window.showErrorMessage(error));
        }),
        vscode.commands.registerCommand('journal.open', () => {
            journal.openJournal().catch(error => vscode.window.showErrorMessage(error));
        })

    );


    context.subscriptions.push(
         
    );

    context.subscriptions.push(
         
    );
}


// this method is called when your extension is deactivated
export function deactivate() {
}

