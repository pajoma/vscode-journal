import type * as vscode from 'vscode';
import { EntryGranularity, HeaderTemplate, InlineTemplate, InputDetailsTimeFormat, ScopedTemplate } from './config';
import { InlineString } from './inline';
import { Input } from './input';
import { JournalPageType } from './config';
import { JFileStat, JFileType } from './fs';

export interface ILogger {
    trace(message: string, ...params: unknown[]): void;
    debug(message: string, ...params: unknown[]): void;
    error(message: string, ...params: unknown[]): void;
    printError(error: Error): void;
    showChannel(): void;
}

export interface IConfiguration {
    getLocale(): string;
    getScopes(): string[];
    getBasePath(scopeId?: string): string;
    getEntryGranularity(scopeId?: string): EntryGranularity;
    getEntryPathPattern(scopeId?: string): string;
    getNotesPathPattern(scopeId?: string): string;
    getFileExtension(scopeId?: string): string;
    getInputDetailsTimeFormat(): InputDetailsTimeFormat;
    getInputTimeThreshold(): number;
    isOpenInNewEditorGroup(): boolean;
    isDevelopmentModeEnabled(): boolean;
    getResolvedEntryPath(date: Date, scopeId?: string): Promise<ScopedTemplate>;
    getEntryFilePattern(date: Date, scopeId?: string): Promise<ScopedTemplate>;
    getResolvedNotesPath(date: Date, scopeId?: string): Promise<ScopedTemplate>;
    getNotesFilePattern(date: Date, input: string, scopeId?: string): Promise<ScopedTemplate>;
    getResolvedWeeklyNotesPath(week: number, year: number, scopeId?: string): Promise<ScopedTemplate>;
    getWeeklyNotesFilePattern(week: number, year: number, input: string, scopeId?: string): Promise<ScopedTemplate>;
    getWeekPathPattern(week: Number, scopeId?: string): Promise<ScopedTemplate>;
    getWeekFilePattern(week: Number, scopeId?: string): Promise<ScopedTemplate>;
    getEntryTemplate(date: Date, scopeId?: string): Promise<HeaderTemplate>;
    getWeeklyTemplate(week: Number, scopeId?: string): Promise<ScopedTemplate>;
    getNotesTemplate(scopeId?: string): Promise<HeaderTemplate>;
    getMemoInlineTemplate(scopeId?: string): Promise<InlineTemplate>;
    getTaskInlineTemplate(scopeId?: string): Promise<InlineTemplate>;
}

export interface IParser {
    parseInput(inputString: string): Promise<Input>;
    resolveNotePathForInput(input: Input, scopeId?: string): Promise<string>;
}

export interface IWriter {
    createEntryForPath(path: string, date: Date): Promise<vscode.TextDocument>;
    createWeeklyForPath(path: string, week: Number): Promise<vscode.TextDocument>;
    createSaveLoadTextDocument(path: string, content: string): Promise<vscode.TextDocument>;
}

export interface IReader {
    loadEntryForInput(input: Input): Promise<vscode.TextDocument>;
    loadEntryForWeek(week: Number, scope?: string): Promise<vscode.TextDocument>;
    loadEntryForDay(date: Date, scope?: string): Promise<vscode.TextDocument>;
}

export interface IInject {
    injectInput(doc: vscode.TextDocument, input: Input): Promise<vscode.TextDocument>;
    injectString(doc: vscode.TextDocument, content: string, position: vscode.Position): Promise<vscode.TextDocument>;
    buildInlineString(doc: vscode.TextDocument, tpl: InlineTemplate, ...values: string[][]): Promise<InlineString>;
    computePositionForInput(doc: vscode.TextDocument, tpl: InlineTemplate): vscode.Position;
    injectInlineString(content: InlineString, ...other: InlineString[]): Promise<vscode.TextDocument>;
    formatNote(input: Input): Promise<string>;
}

export interface IDialogues {
    getUserInputWithValidation(): Promise<Input>;
    pickItem(type: JournalPageType): Promise<Input>;
    getUserInput(tip: string): Promise<string>;
    saveDocument(textDocument: vscode.TextDocument): Promise<vscode.TextDocument>;
    openDocument(path: string | vscode.Uri): Promise<vscode.TextDocument>;
    showDocument(textDocument: vscode.TextDocument): Promise<vscode.TextEditor>;
    showError(error: string | Error): Promise<void>;
}

export type DocumentOpener = (path: string) => Promise<vscode.TextDocument>;

export interface IFileSystem {
    stat(path: string): Promise<JFileStat>;
    readFile(path: string): Promise<Uint8Array>;
    writeFile(path: string, content: Uint8Array): Promise<void>;
    readDirectory(path: string): Promise<[string, JFileType][]>;
    createDirectory(path: string): Promise<void>;
    delete(path: string, options?: { recursive?: boolean }): Promise<void>;
}

export interface JournalController {
    config: IConfiguration;
    logger: ILogger;
    parser: IParser;
    writer: IWriter;
    reader: IReader;
    inject: IInject;
    ui: IDialogues;
    fs: IFileSystem;
}
