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
import { isNotNullOrUndefined, isNullOrUndefined, stringIsNotEmpty } from '../../util';
import { EntryGranularity, InlineTemplate, IWorkspaceConfigReader, NavigationMode, ScopeDefinitionLite, SCOPE_DEFAULT, WeeklySyncConfig } from '../../model';
import { ScopeDefinition } from './patterns';

/**
 * The slice of settings the path/template resolvers depend on. Lets the pure
 * resolvers stay decoupled from the full reader.
 */
export interface IJournalSettings {
    getLocale(): string;
    getBasePath(scopeId?: string): string;
    getBasePathForLocalOpen(scopeId?: string): string;
    getFileExtension(scopeId?: string): string;
    getTplTime(): string | undefined;
    loadInlineTemplate(id: string, defaultValue: string, scopeId?: string): Promise<InlineTemplate>;
}

/**
 * Reads scalar `journal.*` settings, base paths, scope definitions and inline
 * template definitions. Pure VS Code settings access — no path/template
 * resolution (see PathResolver / TemplateProvider).
 */
export class SettingsReader implements IJournalSettings {

    constructor(public config: IWorkspaceConfigReader) { }

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

    /** Returns all known scopes in the settings */
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
        return (this.config.get<string>('navigation.mode') ?? 'existing') as NavigationMode;
    }

    /**
     * The base path, defaults to %USERPROFILE/Journal
     *
     * Supported variables: ${homeDir}, ${workspaceRoot}, ${workspaceFolder}
     */
    public getBasePath(_scopeId?: string): string {
        let scope: string = this.resolveScope(_scopeId);
        const workspaceRoot = vscode.workspace.workspaceFolders?.length && vscode.workspace.workspaceFolders[0].uri.fsPath || '';

        if (scope === SCOPE_DEFAULT) {
            let base: string | undefined = this.config.get<string>('base');

            if (isNotNullOrUndefined(base) && base!.length > 0) {
                base = base!
                    .replace("${homeDir}", os.homedir())
                    .replace("${workspaceRoot}", workspaceRoot)
                    .replace("${workspaceFolder}", workspaceRoot);
                base = this.normalizeBasePathForRuntime(base);
                base = Path.normalize(base);
                return Path.format(Path.parse(base));
            } else {
                return Path.join(os.homedir(), "Journal");
            }
        } else {
            let scopes: ScopeDefinition[] | undefined = this.config.get<[ScopeDefinition]>('scopes');
            if (isNotNullOrUndefined(scopes)) {
                try {
                    let base: string[] = scopes!.filter(v => v.name === scope)
                        .map(scopeDefinition => scopeDefinition.base)
                        .map(scopedBase => {
                            if (stringIsNotEmpty(scopedBase)) {
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
                    return this.getBasePath(SCOPE_DEFAULT);
                }
            }
        }

        throw new Error("Failed to resolve base path");
    }

    /**
     * Returns the configured base path with variable substitution but without
     * remote-runtime normalization. Intended for local handoff from a remote
     * session so the local client can open paths in its own style.
     */
    public getBasePathForLocalOpen(_scopeId?: string): string {
        const scope: string = this.resolveScope(_scopeId);
        const workspaceRoot = vscode.workspace.workspaceFolders?.length && vscode.workspace.workspaceFolders[0].uri.fsPath || '';

        if (scope === SCOPE_DEFAULT) {
            let base: string | undefined = this.config.get<string>('base');
            if (isNotNullOrUndefined(base) && base!.length > 0) {
                return base!
                    .replace("${homeDir}", os.homedir())
                    .replace("${workspaceRoot}", workspaceRoot)
                    .replace("${workspaceFolder}", workspaceRoot);
            }
            return this.getBasePath(SCOPE_DEFAULT);
        }

        let scopes: ScopeDefinition[] | undefined = this.config.get<[ScopeDefinition]>('scopes');
        if (isNotNullOrUndefined(scopes)) {
            const base = scopes!
                .filter(v => v.name === scope)
                .map(scopeDefinition => scopeDefinition.base)
                .find(scopedBase => stringIsNotEmpty(scopedBase));

            if (stringIsNotEmpty(base)) {
                return base!
                    .replace("${homeDir}", os.homedir())
                    .replace("${workspaceRoot}", workspaceRoot)
                    .replace("${workspaceFolder}", workspaceRoot);
            }
        }

        return this.getBasePath(SCOPE_DEFAULT);
    }

    /** True when the configured base path for a scope is a Windows absolute path (e.g. C:\\Users\\...). */
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

    /** File extension for notes and journal entries. Defaults to "md". */
    public getFileExtension(_scopeId?: string): string {
        if (!isNullOrUndefined(_scopeId)) {
            console.error("You requested a scoped file extensions, this is not supported.");
        }

        let ext: string | undefined = this.config.get<string>('ext');
        ext = (isNullOrUndefined(ext) || (ext!.length === 0)) ? 'md' : ext!;
        if (ext.startsWith(".")) { ext = ext.substring(1, ext.length); }
        return ext!;
    }

    public isSyntaxHighlightingEnabled(): boolean {
        let result = this.config.get<boolean>("syntax-highlighting");
        return (isNullOrUndefined(result)) ? false : result!;
    }

    public getEntryGranularity(_scopeId?: string): EntryGranularity {
        const raw = this.config.get<string>("entryGranularity");
        return raw === "weekly" ? "weekly" : "daily";
    }

    /**
     * Output format for the calendar quick-picker description.
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

        return {
            sameDay: `[${labels[0]}]`,
            nextDay: `[${labels[1]}]`,
            nextWeek: 'dddd',
            lastDay: `[${labels[2]}]`,
            lastWeek: `[${labels[3]}] dddd`,
            sameElse: 'DD/MM/YYYY'
        };
    }

    /** Threshold (maximal age) of files shown in the quick picker */
    public getInputTimeThreshold(): number {
        let d: Date = new Date();
        d.setDate(d.getDate() - 60);
        return d.getTime();
    }

    public getTplTime(): string | undefined {
        return this.config.get<string>('tpl-time');
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

    /**
     * Returns the inline template from user or workspace settings.
     * @param _id task, memo, etc.
     */
    public async loadInlineTemplate(_id: string, _defaultValue: string, _scopeId?: string): Promise<InlineTemplate> {
        const scope = this.resolveScope(_scopeId);
        let pattern: InlineTemplate | undefined;
        if (scope === SCOPE_DEFAULT) {
            pattern = this.config.get<InlineTemplate[]>("templates")?.find(tpl => tpl.name === _id);
        } else {
            const scopeDefinition = this.config.get<ScopeDefinition[]>("scopes")?.find(sd => sd.name === scope);
            pattern = scopeDefinition?.templates?.find(tpl => tpl.name === _id)
                ?? this.config.get<InlineTemplate[]>("templates")?.find(tpl => tpl.name === _id);
        }
        if (isNullOrUndefined(pattern)) {
            // #72: legacy config support — moved here so legacy doesn't win when both are set
            if (stringIsNotEmpty(this.config.get<string>("tpl-" + _id))) {
                return {
                    name: _id,
                    scope: SCOPE_DEFAULT,
                    template: this.config.get<string>("tpl-" + _id)!,
                    after: stringIsNotEmpty(this.config.get<string>(_id + '-after')) ? this.config.get<string>(_id + '-after')! : ''
                };
            }
            return { name: _id, scope: SCOPE_DEFAULT, template: _defaultValue, after: '' };
        }
        if (isNullOrUndefined(pattern?.after)) { pattern!.after = ''; }
        if (isNullOrUndefined(pattern?.template)) { pattern!.after = _defaultValue; }
        return pattern!;
    }

    /** Returns a valid scope, falls back to default. */
    public resolveScope(_scopeId?: string): string {
        return (isNullOrUndefined(_scopeId) || (_scopeId!.length === 0)) ? SCOPE_DEFAULT : _scopeId!;
    }
}
