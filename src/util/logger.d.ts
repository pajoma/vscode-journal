import * as vscode from 'vscode';
import * as J from '../.';
export declare class Logger {
    ctrl: J.Util.Ctrl;
    channel: vscode.OutputChannel;
    private DEV_MODE;
    constructor(ctrl: J.Util.Ctrl, channel: vscode.OutputChannel);
    traceLine(message: string, ...optionalParams: any[]): void;
    trace(message: string, ...optionalParams: any[]): void;
    debug(message: string, ...optionalParams: any[]): void;
    printError(error: Error): void;
    error(message: string, ...optionalParams: any[]): void;
    private appendCurrentTime;
}
