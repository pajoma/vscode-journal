import * as vscode from 'vscode';
import * as J from './';
export declare var journalStartup: J.Util.Startup;
export declare var journalConfiguration: J.Extension.Configuration;
export declare function activate(context: vscode.ExtensionContext): {
    extendMarkdownIt(md: any): any;
    getJournalConfiguration(): J.Extension.Configuration;
};
export declare function deactivate(): void;
