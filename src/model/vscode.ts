import { AnyARecord } from 'dns';
import * as vscode from 'vscode';
import * as J from '..';

export interface TimedQuickPick extends vscode.QuickPick<DecoratedQuickPickItem> {
    start?: number; 
}


export interface DecoratedQuickPickItem extends vscode.QuickPickItem {
    parsedInput?: J.Model.Input;
    replace?: boolean;
    path: string;
    pickItem?: J.Model.JournalPageType;
    fileEntry?: J.Model.FileEntry;
}

export interface TextMateRule {
    scope: string; 
    settings: any;  
}