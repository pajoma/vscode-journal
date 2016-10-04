'use strict';

import * as vscode from 'vscode';
import Journal from './journal'; 

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('vscode-journal is now active!');

    let journal = new Journal(); 



    context.subscriptions.push(
        vscode.commands.registerCommand('journal.today', () => {
            console.log("opening today");
            journal.today(); 
        }) 
    );


    context.subscriptions.push(
        vscode.commands.registerCommand('journal.yesterday', () => {
             console.log("opening yesterday");
        }) 
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('journal.memo', () => {
            console.log("opening memo");
        }) 
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('journal.note', () => {
            console.log("opening note");
        }) 
    );
}

// this method is called when your extension is deactivated
export function deactivate() {
}

export function today() {
  // Display a message box to the user
        vscode.window.showInformationMessage('This is today');
}