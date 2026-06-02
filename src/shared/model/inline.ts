import * as vscode from 'vscode';

export interface InlineString {
    position: vscode.Position;
    value: string;
    document: vscode.TextDocument;

}