import * as vscode from 'vscode';
export declare const SCOPE_DEFAULT: string;
export declare enum JournalPageType {
    note = 0,
    entry = 1,
    attachement = 2
}
export interface ScopedTemplate {
    name?: string;
    scope?: string;
    template: string;
    value?: string;
}
export interface FilePattern extends ScopedTemplate {
    type: JournalPageType;
}
export interface PathTemplate extends ScopedTemplate {
    type: JournalPageType;
}
export interface HeaderTemplate extends ScopedTemplate {
}
export interface InlineTemplate extends ScopedTemplate {
    after: string;
}
/**
 * Manages access to journal configuration.
 *
 * Attention: This is an intermediate implementation, still based on the old configuration pre 0.6
 *
 */
export declare class Configuration {
    config: vscode.WorkspaceConfiguration;
    private patterns;
    constructor(config: vscode.WorkspaceConfiguration);
    getLocale(): string;
    /**
     * Returns all known scopes in the settings
     */
    getScopes(): string[];
    /**
     * The base path, defaults to %USERPROFILE/Journal
     *
     * Supported variables: ${homeDir}, ${workspaceRoot}, ${workspaceFolder}
     *
     * @param _scopeId
     */
    getBasePath(_scopeId?: string): string;
    /**
     * Configuration of file extension for notes and journal entries. Defaults to "md" for markdown.
     *
     *
     * @param _scopeId
     */
    getFileExtension(_scopeId?: string): string;
    /**
     * Configuration for the path, where the notes are to be placed
     *
     * Supported variables: homeDir, base, year, month, day, moment
     *
     * @param _scopeId default or individual
     */
    getNotesPathPattern(date: Date, _scopeId?: string): Promise<ScopedTemplate>;
    /**
     * Configuration for the filename, under which the notes file is stored
     *
     * Supported variables: year, month, day, df, ext, input
     *
     * @param _scopeId default or individual
     */
    getNotesFilePattern(date: Date, input: string, _scopeId?: string): Promise<ScopedTemplate>;
    /**
     * Configuration for the path, under which the  journal entry  file is stored
     *
     * Supported variables: base, year, month, day, df
     *
     * @param _scopeId default or individual
     */
    getEntryPathPattern(date: Date, _scopeId?: string): Promise<ScopedTemplate>;
    /**
   * Configuration for the filename, under which the journal entry file is stored
   *
   * Supported variables: year, month, day, moment, ext
   *
   * @param _scopeId default or individual
   *
   * Update 05-2020: Really support scopes, directly access config to support live reloading
   */
    getEntryFilePattern(date: Date, _scopeId?: string): Promise<ScopedTemplate>;
    /**
     * Checks whether any embedded expressions with date formats are in the template, and replaces them in the value using the given date.
     *
     * @param st
     * @param date
     */
    private regExpDateFormats;
    private replaceDateFormats;
    /**
     * Output format for calender format of moment.js, see https://momentjs.com/docs/#/displaying/calendar-time/
     *
     * Used in the quickpicker description. The default also includes the time, which we don't want.
     *
     * FIXME: Externalise to properties (multilanguage)
     */
    getInputDetailsTimeFormat(): {
        sameDay: string;
        nextDay: string;
        nextWeek: string;
        lastDay: string;
        lastWeek: string;
        sameElse: string;
    };
    /**
     * Generates the details for the QuickPick Box (when creating a task)
     *
     * FIXME: Externalize to properties
     * @param dayAsString
     */
    getInputDetailsStringForTask(dayAsString: string): string;
    getInputDetailsStringForEntry(dayAsString: string): string;
    /**
     * Generates the details for the QuickPick Box (when creating a task)
     *
     * FIXME: Externalize to properties
     * @param dayAsString
     */
    getInputDetailsStringForMemo(dayAsString: string): string;
    private labelTranslations;
    getInputLabelTranslation(code: number): string;
    private descTranslations;
    getInputDetailsTranslation(code: number): string | undefined;
    /**
     * Helper Method, threshold (maximal age) of files shown in the quick picker
     */
    getInputTimeThreshold(): number;
    /**
     *
     * Retrieves the (scoped) inline template for a journal entry.
     *
     * Supported variables: localDate, year, month, day, format
     *
     * Default value is: "# ${localDate}\n\n",
     * @param {string} [_scopeId]
     * @returns {Q.Promise<FileTemplate>}
     * @memberof Configuration
     */
    getEntryTemplate(date: Date, _scopeId?: string): Promise<HeaderTemplate>;
    /**
       * Retrieves the (scoped) file template for a note.
       *
       * Default value is: "# ${input}\n\n",
       *
       * @param {string} [_scopeId]  identifier of the scope
       * @returns {Q.Promise<FileTemplate>} scoped file template for notes
       * @memberof Configuration
       */
    getNotesTemplate(_scopeId?: string): Promise<HeaderTemplate>;
    /**
     * Retrieves the (scoped) file template for a note.
     *
     * Default value is: "# {content}\n\n",
     *
     * @param {string} [_scopeId]
     * @returns {Q.Promise<FileTemplate>}
     * @memberof Configuration
     */
    getFileLinkInlineTemplate(_scopeId?: string): Promise<InlineTemplate>;
    /**
    * Retrieves the (scoped) inline template for a memo.
    *
    * Default value is: "- MEMO: {content}",
    *
    * @param {string} [_scopeId]
    * @returns {Q.Promise<InlineTemplate>}
    * @memberof Configuration
    */
    getMemoInlineTemplate(_scopeId?: string): Promise<InlineTemplate>;
    /**
     * Retrieves the (scoped) inline template for a task.
     *
     * Default value is: "- [ ] {content}",
     *
     * @param {string} [_scopeId]
     * @returns {Q.Promise<InlineTemplate>}
     * @memberof Configuration
     */
    getTaskInlineTemplate(_scopeId?: string): Promise<InlineTemplate>;
    /**
     * Returns the template used for printing the time
     *
     * Supported variables: localTime
     */
    getTimeString(): string | undefined;
    /**
     * Retrieves the (scoped) inline template for a time string.
     *
     * Default value is: "LT" (Local Time),
     *
     * @param {string} [_scopeId]
     * @returns {Q.Promise<InlineTemplate>}
     * @memberof Configuration
     */
    getTimeStringTemplate(_scopeId?: string): Promise<ScopedTemplate>;
    isDevelopmentModeEnabled(): boolean;
    isOpenInNewEditorGroup(): boolean;
    /***** PRIVATES *******/
    /**
     * Returns a valid scope, falls back to default.
     *
     * @param _scopeId
     */
    private resolveScope;
    /**
     * Returns the pattern with the given id (loads them from vscode config if needed)
     *
     * @param id
     * @deprecated
     */
    private getPatternX;
    private replaceVariableValue;
    private replaceVariableInTemplate;
    private getInlineTemplateA;
    /**
     * Returns the inline template from user or workspace settings
     * @param _id task, memo, etc.
     * @param _defaultValue
     * @param _scopeId
     */
    private getInlineTemplate;
    /**
     * Cached variant
     * @param _id
     * @param _defaultValue
     * @param _scopeId
     * @deprecated Replaced to support live reloading
     */
    private getInlineTemplateCached;
    /**
     * Loads the patterns if needed from the vscode configuration.
     */
    private loadPatternsX;
}
