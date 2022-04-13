import * as vscode from 'vscode';
import * as J from '../.';
export interface Logger {
    trace(message: string, ...optionalParams: any[]): void;
    debug(message: string, ...optionalParams: any[]): void;
    error(message: string, ...optionalParams: any[]): void;
    printError(error: Error): void;
    showChannel(): void;
}
export declare class ConsoleLogger implements Logger {
    ctrl: J.Util.Ctrl;
    channel: vscode.OutputChannel;
    private devMode;
    constructor(ctrl: J.Util.Ctrl, channel: vscode.OutputChannel);
    showChannel(): void;
    traceLine(message: string, ...optionalParams: any[]): void;
    trace(message: string, ...optionalParams: any[]): void;
    debug(message: string, ...optionalParams: any[]): void;
    printError(error: Error): void;
    error(message: string, ...optionalParams: any[]): void;
    private appendCurrentTime;
}
