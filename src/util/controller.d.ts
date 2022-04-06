import * as J from '../.';
import * as vscode from 'vscode';
export declare class Ctrl {
    private _config;
    private _ui;
    private _parser;
    private _writer;
    private _reader;
    private _logger;
    private _inject;
    constructor(vscodeConfig: vscode.WorkspaceConfiguration);
    /**
     * Getter $config
     * @return {J.Extension.Configuration}
     */
    get configuration(): J.Extension.Configuration;
    /**
     * Getter $ui
     * @return {J.Extension.VSCode}
     */
    get ui(): J.Extension.VSCode;
    /**
     * Getter $writer
     * @return {J.Actions.Writer}
     */
    get writer(): J.Actions.Writer;
    /**
     * Getter $reader
     * @return {J.Actions.Reader}
     */
    get reader(): J.Actions.Reader;
    /**
     * Getter $parser
     * @return {J.Actions.Parser}
     */
    get parser(): J.Actions.Parser;
    /**
     * Getter $config
     * @return {J.Extension.Configuration}
     */
    get config(): J.Extension.Configuration;
    /**
     * Getter inject
     * @return {J.Actions.Inject}
     */
    get inject(): J.Actions.Inject;
    /**
  * Getter logger
  * @return {J.Util.Logger}
  */
    get logger(): J.Util.Logger;
    /**
     * Setter logger
     * @param {J.Util.Logger} value
     */
    set logger(value: J.Util.Logger);
}
