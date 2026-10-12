import { EntryGranularity, HeaderTemplate, InlineTemplate, InputDetailsTimeFormat, NavigationMode, ScopedTemplate, WeeklySyncConfig } from './config';
import { Scope } from './scope';
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
    getNavigationMode(): NavigationMode;
    /** The scope for an id; unknown ids resolve to the default scope. */
    getScope(scopeId?: string): Scope;
    /** All scopes: default, configured, folders. */
    getScopeList(): Scope[];
    getScopeRoot(): string;
    setScopeFolders(names: string[]): void;
    getWeeksPathPatternRaw(scopeId?: string): string;
    getWeeksFilePatternRaw(scopeId?: string): string;
    getWeeklySyncConfig(scopeId?: string): WeeklySyncConfig;
    getBasePathForLocalOpen(scopeId?: string): string;
    /** True when the configured base of the scope is a Windows path (C:\...). */
    isWindowsStyleBaseConfigured(scopeId?: string): boolean;
    getResolvedEntryPathForLocalOpen(date: Date, scopeId?: string): Promise<ScopedTemplate>;
    getWeekPathPatternForLocalOpen(week: number, year: number, scopeId?: string): Promise<ScopedTemplate>;
    getTimeStringTemplate(scopeId?: string): Promise<ScopedTemplate>;
    getFileLinkInlineTemplate(scopeId?: string): Promise<InlineTemplate>;
    getDailyLinkInlineTemplate(scopeId?: string): Promise<InlineTemplate>;
    getResolvedEntryPath(date: Date, scopeId?: string): Promise<ScopedTemplate>;
    getEntryFilePattern(date: Date, scopeId?: string): Promise<ScopedTemplate>;
    getResolvedNotesPath(date: Date, scopeId?: string): Promise<ScopedTemplate>;
    getNotesFilePattern(date: Date, input: string, scopeId?: string): Promise<ScopedTemplate>;
    getResolvedWeeklyNotesPath(week: number, year: number, scopeId?: string): Promise<ScopedTemplate>;
    getWeeklyNotesFilePattern(week: number, year: number, input: string, scopeId?: string): Promise<ScopedTemplate>;
    getWeekPathPattern(week: number, year: number, scopeId?: string): Promise<ScopedTemplate>;
    getWeekFilePattern(week: number, year: number, scopeId?: string): Promise<ScopedTemplate>;
    getEntryTemplate(date: Date, scopeId?: string): Promise<HeaderTemplate>;
    getWeeklyTemplate(week: number, year: number, scopeId?: string): Promise<ScopedTemplate>;
    getNotesTemplate(scopeId?: string): Promise<HeaderTemplate>;
    getMemoInlineTemplate(scopeId?: string): Promise<InlineTemplate>;
    getTaskInlineTemplate(scopeId?: string): Promise<InlineTemplate>;
}

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
 * The text documents of the editor, by file path (#239). The only place that
 * opens, edits, saves and shows them; the domain works with paths and text.
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

/**
 * What the configuration needs from the host (VS Code), as values instead of
 * vscode imports, so that the configuration runs outside VS Code (#251).
 */
export interface HostEnvironment {
    /** UI language, used when `journal.locale` is empty. */
    readonly language: string;
    /** Path of the first workspace folder, '' without one; read on every use. */
    workspaceRoot(): string;
}

/** Host environment outside VS Code (tests, tools): English, no workspace. */
export const NO_HOST: HostEnvironment = { language: 'en', workspaceRoot: () => '' };

export interface IWorkspaceConfigReader {
    get<T>(section: string): T | undefined;
    get<T>(section: string, defaultValue: T): T;
}
