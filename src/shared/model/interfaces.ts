import { JournalPaths, JournalScopes, JournalSettings, JournalTemplates } from 'journal-core';
import { InlineTemplate, InputDetailsTimeFormat, NavigationMode, WeeklySyncConfig } from './config';
import { InlineString, TextPosition } from './inline';
import { Input, NoteInput } from './input';
import { JournalPageType } from './config';
import { JFileStat, JFileType } from './fs';

export interface ILogger {
    trace(message: string, ...params: unknown[]): void;
    debug(message: string, ...params: unknown[]): void;
    error(message: string, ...params: unknown[]): void;
    printError(error: Error): void;
    showChannel(): void;
}

/** Settings of the editor integration only, not of the journal format. */
export interface EditorSettings {
    getNavigationMode(): NavigationMode;
    isSyntaxHighlightingEnabled(): boolean;
    /** Output format for the calendar quick-picker description. */
    getInputDetailsTimeFormat(): InputDetailsTimeFormat;
    /** Threshold (maximal age) of files shown in the quick picker. */
    getInputTimeThreshold(): number;
    isDevelopmentModeEnabled(): boolean;
    isOpenInNewEditorGroup(): boolean;
    getWeeklySyncConfig(scopeId?: string): WeeklySyncConfig;
}

/** The whole configuration; consumers should depend on the narrowest part they use (#278). */
export interface IConfiguration extends JournalSettings, JournalScopes, JournalPaths, JournalTemplates, EditorSettings { }

export interface IParser {
    parseInput(inputString: string): Promise<Input>;
    resolveNotePathForInput(input: Input, scopeId?: string): Promise<string>;
}

/** Creates journal files from their templates; returns their paths. */
export interface IWriter {
    createEntryForPath(path: string, date: Date): Promise<string>;
    createWeeklyForPath(path: string, week: number, year: number): Promise<string>;
    /** Writes a new file with the given content. */
    createFile(path: string, content: string): Promise<string>;
}

/** Finds (and creates if missing) journal entries; returns their paths. */
export interface IReader {
    loadEntryForInput(input: Input): Promise<string>;
    loadEntryForWeek(week: number, year: number, scope?: string): Promise<string>;
    loadEntryForDay(date: Date, scope?: string): Promise<string>;
}

/** Inserts memos, tasks, links and other text into documents, given by path. */
export interface IInject {
    /** Adds the input's memo or task to the entry at `path`. */
    injectInput(path: string, input: Input): Promise<string>;
    injectString(path: string, content: string, position: TextPosition): Promise<void>;
    buildInlineString(path: string, tpl: InlineTemplate, ...values: string[][]): Promise<InlineString>;
    /** Where the template's text goes in the given text: after its `after` line, else below the header. */
    computePositionForInput(text: string, tpl: InlineTemplate): TextPosition;
    injectInlineString(content: InlineString, ...other: InlineString[]): Promise<void>;
    formatNote(input: Input): Promise<string>;
}

export interface IDialogues {
    /** Undefined when the user cancels (Esc). */
    getUserInputWithValidation(): Promise<Input | undefined>;
    /** Undefined when the user cancels (Esc). */
    pickItem(type: JournalPageType): Promise<Input | undefined>;
    getUserInput(tip: string): Promise<string>;
    showError(error: string | Error): Promise<void>;
}

/**
 * The text documents of the editor, by file path (#239). The entries domain,
 * the commands and the notes link sync open, edit, save and show documents
 * only through it and work with paths and text. Exceptions, still on
 * vscode.TextDocument: the weekly daily-links sync and the task code actions.
 */
export interface IEditor {
    /** Current text of the document: the editor's buffer if it is open, otherwise the file. */
    getText(path: string): Promise<string>;
    /** Applies the inserts as one edit. */
    insert(inserts: InlineString[]): Promise<void>;
    save(path: string): Promise<void>;
    /** Shows the document in an editor (reusing a visible one) with the cursor at its end. */
    show(path: string): Promise<void>;
}

export interface IFileSystem {
    stat(path: string): Promise<JFileStat>;
    readFile(path: string): Promise<Uint8Array>;
    writeFile(path: string, content: Uint8Array): Promise<void>;
    readDirectory(path: string): Promise<[string, JFileType][]>;
    createDirectory(path: string): Promise<void>;
    delete(path: string, options?: { recursive?: boolean }): Promise<void>;
}

/** Fired when a journal entry document has been opened/created. */
export interface EntryOpenedEvent {
    /** Path of the entry. */
    path: string;
}

/** Cross-feature signal bus. Features publish/subscribe here instead of importing each other. */
/** Fired when a note was created that the notes-folder scan does not find (e.g. in a folder scope). */
export interface NoteCreatedEvent {
    /** Path of the new note. */
    path: string;
    /** Path of the journal entry that should link to the note. */
    entry: string;
}

/** Subscribes a listener; dispose the result to unsubscribe (compatible with VS Code's Event). */
export type JournalEvent<T> = (listener: (event: T) => unknown) => { dispose(): unknown };

export interface IJournalEvents {
    readonly onEntryOpened: JournalEvent<EntryOpenedEvent>;
    fireEntryOpened(event: EntryOpenedEvent): void;
    readonly onNoteCreated: JournalEvent<NoteCreatedEvent>;
    fireNoteCreated(event: NoteCreatedEvent): void;
}

/** Notes feature as seen by other features (e.g. the smart input opening a picked note). */
export interface INotes {
    /** Creates the note at the input's resolved path if needed, links it from the day's entry, and returns its path. */
    open(input: NoteInput): Promise<string>;
}

export interface JournalController {
    config: IConfiguration;
    logger: ILogger;
    parser: IParser;
    writer: IWriter;
    reader: IReader;
    inject: IInject;
    ui: IDialogues;
    editor: IEditor;
    fs: IFileSystem;
    events: IJournalEvents;
    notes: INotes;
}

export { HostEnvironment, IWorkspaceConfigReader, NO_HOST } from 'journal-core';
