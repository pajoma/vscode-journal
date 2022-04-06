import * as vscode from 'vscode';
import * as J from '../.';
export declare class JournalCodeLensProvider implements vscode.CodeLensProvider {
    private codeLenses;
    private ctrl;
    private _onDidChangeCodeLenses;
    constructor(ctrl: J.Util.Ctrl);
    getRegex(): Promise<RegExp>;
    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.CodeLens[]>;
    resolveCodeLens?(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.CodeLens | Thenable<vscode.CodeLens>;
}
