// Copyright (C) 2016  Patrick Maué
//
// This file is part of vscode-journal.
//
// vscode-journal is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// vscode-journal is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with vscode-journal.  If not, see <http://www.gnu.org/licenses/>.
//
'use strict';

import * as vscode from 'vscode';
import * as os from 'os';
import * as Path from 'path';
import { Util } from '..';
import { isNotNullOrUndefined, isNullOrUndefined } from '../util';
import { HeaderTemplate, InlineTemplate, ScopedTemplate } from '../model';
import { replaceDateFormats, replaceVariableValue } from '../util';

export const SCOPE_DEFAULT: string = "default";

export type WeeklySyncConfig = {
    enabled: boolean;
    anchor: string;
    template: string;
    sortOrder: "ascending" | "descending";
};





/** types in the settings.json */
type PatternDefinition = {
    notes: { path: string; file: string };
    entries: { path: string; file: string };
    weeks: { path: string; file: string };
    weeklyNotes?: { path: string; file: string };
};

export type EntryGranularity = "daily" | "weekly";
export type NavigationMode = 'existing' | 'calendar';
export interface ScopeDefinitionLite { name?: string; base?: string; }

const defaultPatternDefinition: PatternDefinition =
{
    notes: {
        path: "${base}/${year}/${month}/${day}",
        file: "${input}.${ext}"
    },
    entries: {
        path: "${base}/${year}/${month}",
        file: "${day}.${ext}"
    },
    weeks: {
        path: "${base}/${year}",
        file: "week_${week}.${ext}"
    },
    weeklyNotes: {
        path: "${base}/${year}/w${week}",
        file: "${input}.${ext}"
    }
};

type ScopeDefinition = {
    "name": string;
    "base"?: string;
    "patterns": PatternDefinition;
    "templates": InlineTemplate[];

};

/**
 * Manages access to journal configuration. 
 * 
 * Attention: This is an intermediate implementation, still based on the old configuration pre 0.6
 * 
 */
export class Configuration {



    private patterns: Map<string, ScopedTemplate> = new Map();


    constructor(public config: vscode.WorkspaceConfiguration) {

    }

    /**
     * Converts Windows-style absolute paths to a runtime-compatible path when
     * the extension is running on a non-Windows host (e.g. WSL remote).
     */
    private normalizeBasePathForRuntime(basePath: string): string {
        if (process.platform === 'win32') {
            return basePath;
        }

        // Some configurations accidentally include a leading slash before a
        // Windows drive prefix when evaluated remotely: /C:\Users\...
        const trimmed = basePath.replace(/^\/+/, '');
        const isWindowsAbsPath = /^[a-zA-Z]:[\\/]/.test(trimmed);
        if (!isWindowsAbsPath) {
            return basePath;
        }

        // Non-Windows remotes (WSL/SSH/containers): map Windows drive path to
        // Linux mount style to avoid invalid paths such as /c:\Users\...
        const drive = trimmed.charAt(0).toLowerCase();
        const rest = trimmed.substring(2).replace(/\\/g, '/').replace(/^\/+/, '');
        return `/mnt/${drive}/${rest}`;
    }



    public getLocale(): string {

        let locale: string | undefined = this.config.get<string>('locale');

        return (isNullOrUndefined(locale) || (locale!.length === 0)) ? vscode.env.language : locale!;
    }


    /**
     * Returns all known scopes in the settings
     */
    public getScopes(): string[] {
        let res = [SCOPE_DEFAULT];
        let scopes: ScopeDefinition[] | undefined = this.config.get<[ScopeDefinition]>("scopes");
        if (isNotNullOrUndefined(scopes) && scopes!.length > 0) {
            scopes!.map(sd => sd.name).forEach(name => res.push(name));
        }
        return res;
    }

    public getScopeDefinitions(): ScopeDefinitionLite[] {
        const result = this.config.get<ScopeDefinitionLite[]>('scopes');
        return Array.isArray(result) ? result : [];
    }

    public getNavigationMode(): NavigationMode {
        return (vscode.workspace.getConfiguration('journal').get<string>('navigation.mode') ?? 'existing') as NavigationMode;
    }

    /**
     * The base path, defaults to %USERPROFILE/Journal
     * 
     * Supported variables: ${homeDir}, ${workspaceRoot}, ${workspaceFolder}
     * 
     * @param _scopeId 
     */
    public getBasePath(_scopeId?: string): string {
        let scope: string = this.resolveScope(_scopeId);
        const workspaceRoot = vscode.workspace.workspaceFolders?.length && vscode.workspace.workspaceFolders[0].uri.fsPath || '';

        if (scope === SCOPE_DEFAULT) {
            let base: string | undefined = this.config.get<string>('base');

            if (isNotNullOrUndefined(base) && base!.length > 0) {

                // resolve homedir
                base = base!
                    .replace("${homeDir}", os.homedir())
                    .replace("${workspaceRoot}", workspaceRoot)
                    .replace("${workspaceFolder}", workspaceRoot);
                base = this.normalizeBasePathForRuntime(base);
                base = Path.normalize(base);
                return Path.format(Path.parse(base));
            } else {
                // let's default to user profile
                return Path.join(os.homedir(), "Journal");
            }
        } else {
            // there is scope in the request, let's take the base from the scope definition (if it exists)
            let scopes: ScopeDefinition[] | undefined = this.config.get<[ScopeDefinition]>('scopes');
            if (isNotNullOrUndefined(scopes)) {
                try {
                    let base: string[] = scopes!.filter(v => v.name === scope)
                        .map(scopeDefinition => scopeDefinition.base)
                        .map(scopedBase => {
                            if (Util.stringIsNotEmpty(scopedBase)) {
                                scopedBase = scopedBase!
                                    .replace("${homeDir}", os.homedir())
                                    .replace("${workspaceRoot}", workspaceRoot)
                                    .replace("${workspaceFolder}", workspaceRoot);
                                scopedBase = this.normalizeBasePathForRuntime(scopedBase);
                                scopedBase = Path.normalize(scopedBase);
                                return Path.format(Path.parse(scopedBase));
                            } else { return this.getBasePath(SCOPE_DEFAULT); }

                        });
                    if (base.length === 0) { return this.getBasePath(); }
                    else { return base[0]; } // we always take the first

                } catch (error) {
                    console.error("Failed to resolve base path for scope: " + scope);
                    // we return to default
                    return this.getBasePath(SCOPE_DEFAULT);
                }
            }

        }

        throw new Error("Failed to resolve base path");

    }

    /**
     * Returns the configured base path with variable substitution but without
     * remote-runtime normalization. This is intended for local handoff from a
     * remote session so the local client can open paths in its own style.
     */
    public getBasePathForLocalOpen(_scopeId?: string): string {
        const scope: string = this.resolveScope(_scopeId);
        const workspaceRoot = vscode.workspace.workspaceFolders?.length && vscode.workspace.workspaceFolders[0].uri.fsPath || '';

        if (scope === SCOPE_DEFAULT) {
            let base: string | undefined = this.config.get<string>('base');
            if (isNotNullOrUndefined(base) && base!.length > 0) {
                base = base!
                    .replace("${homeDir}", os.homedir())
                    .replace("${workspaceRoot}", workspaceRoot)
                    .replace("${workspaceFolder}", workspaceRoot);
                return base;
            }

            return this.getBasePath(SCOPE_DEFAULT);
        }

        let scopes: ScopeDefinition[] | undefined = this.config.get<[ScopeDefinition]>('scopes');
        if (isNotNullOrUndefined(scopes)) {
            const base = scopes!
                .filter(v => v.name === scope)
                .map(scopeDefinition => scopeDefinition.base)
                .find(scopedBase => Util.stringIsNotEmpty(scopedBase));

            if (Util.stringIsNotEmpty(base)) {
                return base!
                    .replace("${homeDir}", os.homedir())
                    .replace("${workspaceRoot}", workspaceRoot)
                    .replace("${workspaceFolder}", workspaceRoot);
            }
        }

        return this.getBasePath(SCOPE_DEFAULT);
    }

    /**
     * Returns true when the configured base path for a scope is a Windows
     * absolute path (e.g. C:\\Users\\...).
     */
    public isWindowsStyleBaseConfigured(_scopeId?: string): boolean {
        const scope = this.resolveScope(_scopeId);
        let configuredBase: string | undefined;

        if (scope === SCOPE_DEFAULT) {
            configuredBase = this.config.get<string>('base');
        } else {
            configuredBase = this.config
                .get<ScopeDefinition[]>('scopes')
                ?.find(sd => sd.name === scope)
                ?.base;
        }

        if (isNullOrUndefined(configuredBase) || configuredBase!.length === 0) {
            return false;
        }

        return /^\/?[a-zA-Z]:[\\/]/.test(configuredBase!);
    }

    /**
     * Configuration of file extension for notes and journal entries. Defaults to "md" for markdown. 
     * 
     * 
     * @param _scopeId 
     */
    public getFileExtension(_scopeId?: string): string {
        if (!isNullOrUndefined(_scopeId)) {
            console.error("You requested a scoped file extensions, this is not supported.");
        }

        let ext: string | undefined = this.config.get<string>('ext');
        ext = (isNullOrUndefined(ext) && (ext!.length === 0)) ? 'md' : ext!;

        if (ext.startsWith(".")) { ext = ext.substring(1, ext.length); }

        return ext!;
    }


    public isSyntaxHighlightingEnabled(): boolean {
        let result = this.config.get<boolean>("syntax-highlighting");
        return (isNullOrUndefined(result)) ? false : result!;
    }

    /**
 * Configuration for the path, where the notes are to be placed
 * 
 * Supported variables: homeDir, base, year, month, day, moment
 * 
 * @param _scopeId default or individual
 */
    public getNotesPathPattern(_scopeId?: string): string {
        let result: string | undefined;

        if (this.resolveScope(_scopeId) === SCOPE_DEFAULT) {
            result = this.config.get<PatternDefinition>("patterns")?.notes?.path;
        } else {
            result = this.config.get<ScopeDefinition[]>("scopes")?.find(sd => sd.name === _scopeId)?.patterns?.notes?.path;
        }

        if (isNullOrUndefined(result) || result!.length === 0) {
            result = defaultPatternDefinition.entries.path;
        }

        return result!;
    }

    /**
     * Configuration for the path, where the notes are to be placed
     * 
     * Supported variables: homeDir, base, year, month, day, moment
     * 
     * @param _scopeId default or individual
     */
    public async getResolvedNotesPath(date: Date, _scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = {
            scope: (this.resolveScope(_scopeId) === SCOPE_DEFAULT) ? SCOPE_DEFAULT : _scopeId!,
            template: this.getNotesPathPattern(_scopeId)!
        };
        scopedTemplate.value = scopedTemplate.template;
        scopedTemplate.value = replaceVariableValue("homeDir", os.homedir(), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("base", this.getBasePath(_scopeId), scopedTemplate.value);
        scopedTemplate.value = replaceDateFormats(scopedTemplate.value, date, this.getLocale());
        return scopedTemplate;
    }

    /**
     * Configuration for the filename, under which the notes file is stored
     * 
     * Supported variables: year, month, day, df, ext, input
     * 
     * @param _scopeId default or individual
     */
    public async getNotesFilePattern(date: Date, input: string, _scopeId?: string): Promise<ScopedTemplate> {
        let definition: string | undefined;
        const scopedTemplate: ScopedTemplate = { scope: SCOPE_DEFAULT, template: "" };
        if (this.resolveScope(_scopeId) === SCOPE_DEFAULT) {
            definition = this.config.get<PatternDefinition>("patterns")?.notes?.file;
        } else {
            definition = this.config.get<ScopeDefinition[]>("scopes")?.filter(sd => sd.name === _scopeId).pop()?.patterns?.notes?.file;
            scopedTemplate.scope = _scopeId!;
        }
        if (isNullOrUndefined(definition) || definition!.length === 0) {
            definition = defaultPatternDefinition.notes.file;
        }
        scopedTemplate.template = definition!;
        scopedTemplate.value = replaceVariableValue("ext", this.getFileExtension(), scopedTemplate.template);
        scopedTemplate.value = replaceVariableValue("input", input, scopedTemplate.value);
        scopedTemplate.value = replaceDateFormats(scopedTemplate.value, date, this.getLocale());
        return scopedTemplate;
    }

    public getEntryGranularity(_scopeId?: string): EntryGranularity {
        const raw = this.config.get<string>("entryGranularity");
        return raw === "weekly" ? "weekly" : "daily";
    }

    public getWeeklyNotesPathPattern(_scopeId?: string): string {
        let result: string | undefined;
        if (this.resolveScope(_scopeId) === SCOPE_DEFAULT) {
            result = this.config.get<PatternDefinition>("patterns")?.weeklyNotes?.path;
        } else {
            result = this.config.get<ScopeDefinition[]>("scopes")?.find(sd => sd.name === _scopeId)?.patterns?.weeklyNotes?.path;
        }
        if (isNullOrUndefined(result) || result!.length === 0) {
            result = defaultPatternDefinition.weeklyNotes!.path;
        }
        return result!;
    }

    public async getResolvedWeeklyNotesPath(week: number, year: number, _scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = {
            scope: (this.resolveScope(_scopeId) === SCOPE_DEFAULT) ? SCOPE_DEFAULT : _scopeId!,
            template: this.getWeeklyNotesPathPattern(_scopeId)
        };
        scopedTemplate.value = scopedTemplate.template;
        scopedTemplate.value = replaceVariableValue("homeDir", os.homedir(), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("base", this.getBasePath(_scopeId), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("year", String(year), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("week", String(week), scopedTemplate.value);
        return scopedTemplate;
    }

    public async getWeeklyNotesFilePattern(week: number, year: number, input: string, _scopeId?: string): Promise<ScopedTemplate> {
        let definition: string | undefined;
        const scopedTemplate: ScopedTemplate = { scope: SCOPE_DEFAULT, template: "" };
        if (this.resolveScope(_scopeId) === SCOPE_DEFAULT) {
            definition = this.config.get<PatternDefinition>("patterns")?.weeklyNotes?.file;
        } else {
            definition = this.config.get<ScopeDefinition[]>("scopes")?.filter(sd => sd.name === _scopeId).pop()?.patterns?.weeklyNotes?.file;
            scopedTemplate.scope = _scopeId!;
        }
        if (isNullOrUndefined(definition) || definition!.length === 0) {
            definition = defaultPatternDefinition.weeklyNotes!.file;
        }
        scopedTemplate.template = definition!;
        scopedTemplate.value = replaceVariableValue("ext", this.getFileExtension(), scopedTemplate.template);
        scopedTemplate.value = replaceVariableValue("input", input, scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("year", String(year), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("week", String(week), scopedTemplate.value);
        return scopedTemplate;
    }

    /** Returns the raw weeks path template (e.g. "${base}/${year}"), without variable substitution. */
    public getWeeksPathPatternRaw(_scopeId?: string): string {
        let result: string | undefined;
        if (this.resolveScope(_scopeId) === SCOPE_DEFAULT) {
            result = this.config.get<PatternDefinition>("patterns")?.weeks?.path;
        } else {
            result = this.config.get<ScopeDefinition[]>("scopes")?.find(sd => sd.name === _scopeId)?.patterns?.weeks?.path;
        }
        if (isNullOrUndefined(result) || result!.length === 0) {
            result = defaultPatternDefinition.weeks.path;
        }
        return result!;
    }

    /** Returns the raw weeks file template (e.g. "week_${week}.${ext}"), without variable substitution. */
    public getWeeksFilePatternRaw(_scopeId?: string): string {
        let result: string | undefined;
        if (this.resolveScope(_scopeId) === SCOPE_DEFAULT) {
            result = this.config.get<PatternDefinition>("patterns")?.weeks?.file;
        } else {
            result = this.config.get<ScopeDefinition[]>("scopes")?.find(sd => sd.name === _scopeId)?.patterns?.weeks?.file;
        }
        if (isNullOrUndefined(result) || result!.length === 0) {
            result = defaultPatternDefinition.weeks.file;
        }
        return result!;
    }

    async getWeekFilePattern(week: Number, _scopeId?: string): Promise<ScopedTemplate> {
        let definition: string | undefined;
        const scopedTemplate: ScopedTemplate = { scope: SCOPE_DEFAULT, template: "" };
        if (this.resolveScope(_scopeId) === SCOPE_DEFAULT) {
            definition = this.config.get<PatternDefinition>("patterns")?.weeks?.file;
        } else {
            definition = this.config.get<ScopeDefinition[]>("scopes")?.filter(sd => sd.name === _scopeId).pop()?.patterns?.notes?.file;
            scopedTemplate.scope = _scopeId!;
        }
        if (isNullOrUndefined(definition) || definition!.length === 0) {
            definition = defaultPatternDefinition.notes.file;
        }
        scopedTemplate.value = definition!;
        scopedTemplate.value = replaceVariableValue("ext", this.getFileExtension(), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("week", week + "", scopedTemplate.value);
        scopedTemplate.value = replaceDateFormats(scopedTemplate.value, new Date(), this.getLocale());
        return scopedTemplate;
    }
    public async getWeekPathPatternForLocalOpen(week: Number, _scopeId?: string): Promise<ScopedTemplate> {
        let definition: string | undefined;
        const scopedTemplate: ScopedTemplate = { scope: SCOPE_DEFAULT, template: "" };
        if (this.resolveScope(_scopeId) === SCOPE_DEFAULT) {
            definition = this.config.get<PatternDefinition>("patterns")?.weeks?.path;
        } else {
            definition = this.config.get<ScopeDefinition[]>("scopes")?.filter(sd => sd.name === _scopeId).pop()?.patterns?.entries?.path;
            scopedTemplate.scope = _scopeId!;
        }
        if (isNullOrUndefined(definition) || definition!.length === 0) {
            definition = defaultPatternDefinition.entries.path;
        }
        scopedTemplate.template = definition!;
        scopedTemplate.value = scopedTemplate.template;
        scopedTemplate.value = replaceVariableValue("base", this.getBasePathForLocalOpen(_scopeId), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("week", week + "", scopedTemplate.value);
        scopedTemplate.value = replaceDateFormats(scopedTemplate.value, new Date(), this.getLocale());
        return scopedTemplate;
    }

    async getWeekPathPattern(week: Number, _scopeId?: string): Promise<ScopedTemplate> {
        let definition: string | undefined;
        const scopedTemplate: ScopedTemplate = { scope: SCOPE_DEFAULT, template: "" };
        if (this.resolveScope(_scopeId) === SCOPE_DEFAULT) {
            definition = this.config.get<PatternDefinition>("patterns")?.weeks?.path;
        } else {
            definition = this.config.get<ScopeDefinition[]>("scopes")?.filter(sd => sd.name === _scopeId).pop()?.patterns?.entries?.path;
            scopedTemplate.scope = _scopeId!;
        }
        if (isNullOrUndefined(definition) || definition!.length === 0) {
            definition = defaultPatternDefinition.entries.path;
        }
        scopedTemplate.template = definition!;
        scopedTemplate.value = scopedTemplate.template;
        scopedTemplate.value = replaceVariableValue("base", this.getBasePath(_scopeId), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("week", week + "", scopedTemplate.value);
        scopedTemplate.value = replaceDateFormats(scopedTemplate.value, new Date(), this.getLocale());
        scopedTemplate.value = Path.normalize(scopedTemplate.value);
        return scopedTemplate;
    }

    /**
     * Configuration for the path, under which the  journal entry  file is stored
     * 
     * Supported variables: base, year, month, day, df
     * 
     * @param _scopeId default or individual
     */
    public getEntryPathPattern(_scopeId?: string): string {
        let result: string | undefined;

        if (this.resolveScope(_scopeId) === SCOPE_DEFAULT) {
            result = this.config.get<PatternDefinition>("patterns")?.["entries"]?.path;
        } else {
            result = this.config.get<ScopeDefinition[]>("scopes")?.filter(sd => sd.name === _scopeId).pop()?.patterns?.entries?.path;
        }

        if (isNullOrUndefined(result) || result!.length === 0) {
            result = defaultPatternDefinition.entries.path;
        }

        return result!;

    }


    /**
     * Configuration for the path, under which the  journal entry  file is stored
     * 
     * Supported variables: base, year, month, day, df
     * 
     * @param _scopeId default or individual
     */
    public async getResolvedEntryPath(date: Date, _scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = {
            scope: (this.resolveScope(_scopeId) === SCOPE_DEFAULT) ? SCOPE_DEFAULT : _scopeId!,
            template: this.getEntryPathPattern(_scopeId)!
        };
        scopedTemplate.value = replaceVariableValue("base", this.getBasePath(_scopeId), scopedTemplate.template);
        scopedTemplate.value = replaceDateFormats(scopedTemplate.value, date, this.getLocale());
        scopedTemplate.value = Path.normalize(scopedTemplate.value);
        return scopedTemplate;
    }

    /**
     * Returns the entry path using the local-open base path (no remote normalization).
     */
    public async getResolvedEntryPathForLocalOpen(date: Date, _scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = {
            scope: (this.resolveScope(_scopeId) === SCOPE_DEFAULT) ? SCOPE_DEFAULT : _scopeId!,
            template: this.getEntryPathPattern(_scopeId)!
        };
        scopedTemplate.value = replaceVariableValue("base", this.getBasePathForLocalOpen(_scopeId), scopedTemplate.template);
        scopedTemplate.value = replaceDateFormats(scopedTemplate.value, date, this.getLocale());
        // Do not use Path.normalize here — may use remote OS separators conflicting with local Windows paths.
        return scopedTemplate;
    }



    /**
   * Configuration for the filename, under which the journal entry file is stored
   * 
   * Supported variables: year, month, day, moment, ext
   * 
   * @param _scopeId default or individual
   * 
   * Update 05-2020: Really support scopes, directly access config to support live reloading
   */
    public async getEntryFilePattern(date: Date, _scopeId?: string): Promise<ScopedTemplate> {
        let definition: string | undefined;
        const scopedTemplate: ScopedTemplate = { scope: SCOPE_DEFAULT, template: "" };
        if (this.resolveScope(_scopeId) === SCOPE_DEFAULT) {
            definition = this.config.get<PatternDefinition>("patterns")?.entries?.file;
        } else {
            definition = this.config.get<ScopeDefinition[]>("scopes")?.filter(sd => sd.name === _scopeId).pop()?.patterns?.entries?.file;
            scopedTemplate.scope = _scopeId!;
        }
        if (isNullOrUndefined(definition) || definition!.length === 0) {
            definition = defaultPatternDefinition.entries.file;
        }
        scopedTemplate.template = definition!;
        scopedTemplate.value = replaceVariableValue("ext", this.getFileExtension(_scopeId), scopedTemplate.template);
        scopedTemplate.value = replaceDateFormats(scopedTemplate.value, date, this.getLocale());
        return scopedTemplate;
    }





    /**
     * Output format for calender format of moment.js, see https://momentjs.com/docs/#/displaying/calendar-time/
     * 
     * Used in the quickpicker description. The default also includes the time, which we don't want. 
     * 
     * FIXME: Externalise to properties (multilanguage)
     */
    public getInputDetailsTimeFormat() {
        let labels: string[] = new Array(4);

        if (this.getLocale().startsWith("en")) {
            labels = ["for today", "for tomorrow", "for yesterday", "last"];
        } else if (this.getLocale().startsWith("de")) {
            labels = ["für heute", "für morgen", " für gestern", "letzten"];
        } else if (this.getLocale().startsWith("fr")) {
            labels = ["pour aujourd'hui", "pour demain", "d'hier"];
        } else if (this.getLocale().startsWith("es")) {
            labels = ["para hoy", "de mañana", "de ayer", "del último"];
        }

        let config = {
            sameDay: `[${labels[0]}]`,
            nextDay: `[${labels[1]}]`,
            nextWeek: 'dddd',
            lastDay: `[${labels[2]}]`,
            lastWeek: `[${labels[3]}] dddd`,
            sameElse: 'DD/MM/YYYY'
        };

        return config;

        /*  
            Memo der Seite für morgen hinzufügen
            Add memo to the page for tomorrow
            Ajouter un mémo à la page pour demain
            Añadir un memo a la página de mañana

            Añadir un memo a la página de ayer

        */
    }














    /**
     * Helper Method, threshold (maximal age) of files shown in the quick picker
     */
    getInputTimeThreshold(): number {
        let offset = -60;
        let d: Date = new Date();
        d.setDate(d.getDate() + offset);
        return d.getTime();
    }


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
    public async getEntryTemplate(date: Date, _scopeId?: string): Promise<HeaderTemplate> {
        return this.getInlineTemplate("entry", "# ${localDate}\n\n", this.resolveScope(_scopeId))
            .then((sp: ScopedTemplate) => {

                // backwards compatibility, replace {content} with ${input} as default
                sp.template = sp.template.replace("{content}", "${localDate}");

                sp.value = sp.template;
                sp.value = replaceDateFormats(sp.value, date, this.getLocale());
                sp.value = replaceVariableValue("base", this.getBasePath(_scopeId), sp.value);

                return sp;
            });
    }

    /**
         *
         * Retrieves the (scoped) inline template for a weekly entry. 
         * 
         * Supported variables: week number
         * 
         * Default value is: "# Week ${week}\n\n",
         * @param {string} [_scopeId]
         * @returns {Q.Promise<FileTemplate>}
         * @memberof Configuration
         */
    public async getWeeklyTemplate(week: Number, _scopeId?: string) {
        return this.getInlineTemplate("weekly", "#  Week ${week}\n\n", this.resolveScope(_scopeId))
            .then((sp: ScopedTemplate) => {

                sp.value = sp.template;
                sp.value = replaceVariableValue("week", week + "", sp.value);

                return sp;
            });
    }

    /**
       * Retrieves the (scoped) file template for a note. 
       * 
       * Default value is: "# ${input}\n\n",
       *
       * @param {string} [_scopeId]  identifier of the scope
       * @returns {Q.Promise<FileTemplate>} scoped file template for notes
       * @memberof Configuration 
       */
    public async getNotesTemplate(_scopeId?: string): Promise<HeaderTemplate> {

        let tpl: ScopedTemplate = await this.getInlineTemplate("note", "# ${input}\n${tags}\n", _scopeId);
        // backwards compatibility, replace {content} with ${input} as default
        tpl.template = tpl.template.replace("{content}", "${input}");

        tpl.value = replaceDateFormats(tpl.template, new Date(), this.getLocale());

        return tpl;
    }






    /**
     * Retrieves the (scoped) file template for a note. 
     * 
     * Default value is: "# {content}\n\n",
     *
     * @param {string} [_scopeId]
     * @returns {Q.Promise<FileTemplate>}
     * @memberof Configuration
     */
    public async getFileLinkInlineTemplate(_scopeId?: string): Promise<InlineTemplate> {
        return this.getInlineTemplate("files", "- Link: [${title}](${link})", this.resolveScope(_scopeId))
            .then((result: InlineTemplate) => {
                // backwards compatibility, replace {} with ${} (ts embedded expressions) as default
                result.template = result.template.replace("{label}", "${title}");

                /*
                // replacing {link} with ${link} results in $${link} (cause $ is ignored)
                if (result.template.search("\\$\\{link\\}") === -1) {
                    result.template = result.template.replace("{link}", "${link}");
                }*/

                result.value = result.template;
                return result;
            });
    }

    /**
    * Retrieves the (scoped) inline template for a memo. 
    * 
    * Default value is: "- MEMO: {content}",
    *
    * @param {string} [_scopeId]
    * @returns {Q.Promise<InlineTemplate>}
    * @memberof Configuration
    */
    public async getMemoInlineTemplate(_scopeId?: string): Promise<InlineTemplate> {

        return this.getInlineTemplate("memo", "- Memo: ${input}", this.resolveScope(_scopeId))
            .then((result: InlineTemplate) => {
                // backwards compatibility, replace {} with ${} (embedded expressions) as default
                result.template = result.template.replace("{content}", "${input}");

                result.value = replaceDateFormats(result.template, new Date(), this.getLocale());
                return result;
            });
    }

    /**
     * Retrieves the (scoped) inline template for a task. 
     * 
     * Default value is: "- [ ] {content}",
     *
     * @param {string} [_scopeId]
     * @returns {Q.Promise<InlineTemplate>}
     * @memberof Configuration
     */
    public async getTaskInlineTemplate(_scopeId?: string): Promise<InlineTemplate> {
        return this.getInlineTemplate("task", "- [ ] ${input}", this.resolveScope(_scopeId))
            .then((res: InlineTemplate) => {
                // backwards compatibility, replace {content} with ${input} as default
                res.template = res.template.replace("{content}", "${input}");

                res.value = replaceDateFormats(res.template, new Date(), this.getLocale());

                return res;
            });
    }


    /**
     * Returns the template used for printing the time
     * 
     * Supported variables: localTime
     */
    public getTimeString(): string | undefined {
        let cv = this.config.get<string>('tpl-time');
        cv = isNullOrUndefined(cv) ? "LT" : cv;

        cv = cv!.replace("${localTime}", "LT");
        return cv;
    }


    /**
     * Retrieves the (scoped) inline template for a time string. 
     * 
     * Default value is: "LT" (Local Time),
     *
     * @param {string} [_scopeId]
     * @returns {Q.Promise<InlineTemplate>}
     * @memberof Configuration
     */
    public async getTimeStringTemplate(_scopeId?: string): Promise<ScopedTemplate> {
        return this.getInlineTemplate("time", "LT", this.resolveScope(_scopeId))
            .then(tpl => {
                tpl.value = replaceDateFormats(tpl.template, new Date(), this.getLocale());
                return tpl;
            });
    }


    public isDevelopmentModeEnabled(): boolean {
        let dev: boolean | undefined = this.config.get<boolean>('dev');
        return (!isNullOrUndefined(dev)) ? dev! : false;
    }

    public isOpenInNewEditorGroup(): boolean {
        let res: boolean | undefined = this.config.get<boolean>('openInNewEditorGroup');
        return (!isNullOrUndefined(res)) ? res! : false;
    }


    public getWeeklySyncConfig(_scopeId?: string): WeeklySyncConfig {
        const raw = this.config.get<Partial<WeeklySyncConfig>>("weeklySync") ?? {};
        return {
            enabled:   raw.enabled   !== undefined ? raw.enabled   : true,
            anchor:    raw.anchor    !== undefined ? raw.anchor    : "## Daily Entries",
            template:  raw.template  !== undefined ? raw.template  : "- [${weekday}, ${d:MMMM DD}](${link})",
            sortOrder: raw.sortOrder === "descending" ? "descending" : "ascending",
        };
    }

    public async getDailyLinkInlineTemplate(_scopeId?: string): Promise<InlineTemplate> {
        return this.getInlineTemplate("dailyLink", "- [${weekday}, ${d:MMMM DD}](${link})", this.resolveScope(_scopeId))
            .then((result: InlineTemplate) => {
                result.value = result.template;
                return result;
            });
    }

    /***** PRIVATES *******/

    /**
     * Returns a valid scope, falls back to default. 
     * 
     * @param _scopeId 
     */
    private resolveScope(_scopeId?: string): string {
        return (isNullOrUndefined(_scopeId) || (_scopeId!.length === 0)) ? SCOPE_DEFAULT : _scopeId!;
    }




    /**
     * Returns the inline template from user or workspace settings 
     * @param _id task, memo, etc. 
     * @param _defaultValue  
     * @param _scopeId 
     */
    private async getInlineTemplate(_id: string, _defaultValue: string, _scopeId?: string): Promise<InlineTemplate> {
        const scope = this.resolveScope(_scopeId);
        let pattern: InlineTemplate | undefined;
        if (scope === SCOPE_DEFAULT) {
            pattern = this.config.get<InlineTemplate[]>("templates")?.find(tpl => tpl.name === _id);
        } else {
            const scopeDefinition = this.config.get<ScopeDefinition[]>("scopes")?.find(sd => sd.name === scope);
            pattern = scopeDefinition?.templates?.find(tpl => tpl.name === _id)
                ?? this.config.get<InlineTemplate[]>("templates")?.find(tpl => tpl.name === _id);
        }
        if (Util.isNullOrUndefined(pattern)) {
            // #72: legacy config support — moved here so legacy doesn't win when both are set
            if (Util.stringIsNotEmpty(this.config.get<string>("tpl-" + _id))) {
                return {
                    name: _id,
                    scope: SCOPE_DEFAULT,
                    template: this.config.get<string>("tpl-" + _id)!,
                    after: Util.stringIsNotEmpty(this.config.get<string>(_id + '-after')) ? this.config.get<string>(_id + '-after')! : ''
                };
            }
            return { name: _id, scope: SCOPE_DEFAULT, template: _defaultValue, after: '' };
        }
        if (Util.isNullOrUndefined(pattern?.after)) { pattern!.after = ''; }
        if (Util.isNullOrUndefined(pattern?.template)) { pattern!.after = _defaultValue; }
        return pattern!;
    }


    /**
     * Cached variant
     * @param _id
     * @param _defaultValue 
     * @param _scopeId 
     * @deprecated Replaced to support live reloading
     */
    private async getInlineTemplateCached(_id: string, _defaultValue: string, _scopeId: string): Promise<InlineTemplate> {
        const key: string = _scopeId + "." + _id;
        let pattern: InlineTemplate = <InlineTemplate>this.patterns.get(key);
        if (isNullOrUndefined(pattern)) {
            const tpl = this.config.get<string>(_id);
            const after = this.config.get<string>(_id + '-after');
            pattern = {
                scope: this.resolveScope(_scopeId),
                template: isNullOrUndefined(tpl) ? _defaultValue : tpl!,
                after: isNullOrUndefined(after) ? '' : after!
            };
            this.patterns.set(key, pattern);
        }
        pattern.value = pattern.template;
        return pattern;
    }




}
