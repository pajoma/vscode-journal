import * as vscode from 'vscode';
import * as J from './';
export declare var journalStartup: J.Extension.Startup;
export declare var journalConfiguration: J.Extension.Configuration;
export declare function activate(context: vscode.ExtensionContext): {
    getJournalConfiguration(): J.Extension.Configuration;
};
export declare function deactivate(): void;
