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

import * as os from 'os';
import * as Path from 'path';
import { isNotNullOrUndefined, isNullOrUndefined } from '../lang';
import { stringIsNotEmpty } from '../strings/strings';
import { EntryGranularity, HostEnvironment, InlineTemplate, IWorkspaceConfigReader, NavigationMode, NO_HOST, Scope, SCOPE_DEFAULT, WeeklySyncConfig } from '../model/index';
import { ScopeRegistry } from './scope-registry';

/**
 * The slice of settings the path/template resolvers depend on. Lets the pure
 * resolvers stay decoupled from the full reader.
 */
export interface IJournalSettings {
    getLocale(): string;
    isWeeklyTemplateDates(): boolean;
    getBasePath(scopeId?: string): string;
    getBasePathForLocalOpen(scopeId?: string): string;
    getFileExtension(scopeId?: string): string;
    getTplTime(): string | undefined;
    loadInlineTemplate(id: string, defaultValue: string, scopeId?: string): Promise<InlineTemplate>;
    getScope(scopeId?: string): Scope;
}

/**
 * Reads scalar `journal.*` settings, base paths, scope definitions and inline
 * template definitions. Pure VS Code settings access — no path/template
 * resolution (see PathResolver / TemplateProvider).
 */
export class SettingsReader implements IJournalSettings {

    private readonly scopes: ScopeRegistry;

    constructor(public config: IWorkspaceConfigReader, private readonly host: HostEnvironment = NO_HOST) {
        this.scopes = new ScopeRegistry(config, () => this.getScopeRoot());
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
        return (isNullOrUndefined(locale) || (locale!.length === 0)) ? this.host.language : locale!;
    }

    /** The scope for an id (unknown ids resolve to the default scope), see {@link ScopeRegistry}. */
    public getScope(scopeId?: string): Scope {
        return this.scopes.get(scopeId);
    }

    /** All scopes: default, configured in the settings, folders below the scope root. */
    public getScopeList(): Scope[] {
        return this.scopes.all();
    }

    /** Names of all scopes, the default scope first. */
    public getScopes(): string[] {
        return this.scopes.all().map(scope => scope.name);
    }

    /**
     * Folder whose sub-folders are scopes (`journal.scopeRoot`, default `${base}/scopes`).
     * Relative paths are relative to the journal base.
     *
     * Supported variables: ${base}, ${homeDir}, ${workspaceRoot}, ${workspaceFolder}
     */
    public getScopeRoot(): string {
        const raw = this.config.get<string>('scopeRoot');
        const base = this.getBasePath();
        const root = (stringIsNotEmpty(raw) ? raw! : "${base}/scopes").replace("${base}", base);
        return this.resolvePath(Path.isAbsolute(root) || /^\$\{(homeDir|workspaceRoot|workspaceFolder)\}/.test(root) ? root : Path.join(base, root));
    }

    /** Updates the scope folders found below the scope root (scanned asynchronously by the scopes feature). */
    public setScopeFolders(names: string[]): void {
        this.scopes.setFolders(names);
    }

    public getNavigationMode(): NavigationMode {
        return (this.config.get<string>('navigation.mode') ?? 'existing') as NavigationMode;
    }

    /**
     * Resolves ${homeDir}, ${workspaceRoot} and ${workspaceFolder} and normalizes
     * the path for the runtime (used for journal.base, scope bases and the scope root).
     */
    private resolvePath(value: string): string {
        const workspaceRoot = this.host.workspaceRoot();
        const resolved = value
            .replace("${homeDir}", os.homedir())
            .replace("${workspaceRoot}", workspaceRoot)
            .replace("${workspaceFolder}", workspaceRoot);
        return Path.format(Path.parse(Path.normalize(this.normalizeBasePathForRuntime(resolved))));
    }

    /**
     * The base path, defaults to %USERPROFILE/Journal
     *
     * Supported variables: ${homeDir}, ${workspaceRoot}, ${workspaceFolder}
     */
    public getBasePath(_scopeId?: string): string {
        // a scope without own base (incl. folder scopes) uses the journal base
        const scopedBase = this.getScope(_scopeId).base;
        if (scopedBase) { return this.resolvePath(scopedBase); }

        const base: string | undefined = this.config.get<string>('base');
        return stringIsNotEmpty(base) ? this.resolvePath(base!) : Path.join(os.homedir(), "Journal");
    }

    /**
     * Returns the configured base path with variable substitution but without
     * remote-runtime normalization. Intended for local handoff from a remote
     * session so the local client can open paths in its own style.
     */
    public getBasePathForLocalOpen(_scopeId?: string): string {
        const workspaceRoot = this.host.workspaceRoot();
        const base = this.getScope(_scopeId).base ?? this.config.get<string>('base');
        if (!stringIsNotEmpty(base)) {
            return this.getBasePath(SCOPE_DEFAULT);
        }
        return base!
            .replace("${homeDir}", os.homedir())
            .replace("${workspaceRoot}", workspaceRoot)
            .replace("${workspaceFolder}", workspaceRoot);
    }

    /** True when the configured base path for a scope is a Windows absolute path (e.g. C:\\Users\\...). */
    public isWindowsStyleBaseConfigured(_scopeId?: string): boolean {
        const scope = this.getScope(_scopeId);
        const configuredBase: string | undefined = scope.isDefault ? this.config.get<string>('base') : scope.base;

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

    /** `journal.weeklyTemplateDates`: resolve date variables in the weekly template (#137). Off by default. */
    public isWeeklyTemplateDates(): boolean {
        return this.config.get<boolean>('weeklyTemplateDates') === true;
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
        const found = this.getScope(_scopeId).template(_id)
            ?? this.config.get<InlineTemplate[]>("templates")?.find(tpl => tpl.name === _id);
        // copy: the settings object must not be modified
        const pattern: InlineTemplate | undefined = found ? { ...found } : undefined;
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
        if (isNullOrUndefined(pattern!.after)) { pattern!.after = ''; }
        if (isNullOrUndefined(pattern!.template)) { pattern!.template = _defaultValue; }
        return pattern!;
    }
}
