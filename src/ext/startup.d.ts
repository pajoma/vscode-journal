import * as vscode from 'vscode';
import * as J from '..';
export declare class Startup {
    context: vscode.ExtensionContext;
    config: vscode.WorkspaceConfiguration;
    /**
     *
     */
    constructor(context: vscode.ExtensionContext, config: vscode.WorkspaceConfiguration);
    initialize(): Promise<J.Util.Ctrl>;
    registerLoggingChannel(ctrl: J.Util.Ctrl, context: vscode.ExtensionContext): Promise<J.Util.Ctrl>;
    registerCodeLens(ctrl: J.Util.Ctrl, context: vscode.ExtensionContext): Promise<J.Util.Ctrl>;
    registerCommands(ctrl: J.Util.Ctrl, context: vscode.ExtensionContext): Promise<J.Util.Ctrl>;
    /**
     * Sets default syntax highlighting settings on startup, we try to differentiate between dark and light themes
     *
     * @param {J.Util.Ctrl} ctrl
     * @param {vscode.ExtensionContext} context
     * @returns {Q.Promise<J.Util.Ctrl>}
     * @memberof Startup
     */
    registerSyntaxHighlighting(ctrl: J.Util.Ctrl): Promise<J.Util.Ctrl>;
}
