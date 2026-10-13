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

import * as os from 'os';
import * as Path from 'path';
import { JournalScopes, JournalSettings } from './interfaces';
import { Scope } from './scope';
import { ScopeRegistry } from './scope-registry';
import { EntryGranularity, HostEnvironment, InlineTemplate, IWorkspaceConfigReader, NO_HOST, SCOPE_DEFAULT } from './types';

export function nonEmpty(value: string | undefined | null): value is string {
    return value !== undefined && value !== null && value.length > 0;
}

/**
 * Reads the journal format settings: locale, base paths, extension, scopes and
 * template definitions. No path or template resolution (see PathResolver /
 * TemplateProvider).
 */
export class SettingsReader implements JournalSettings, JournalScopes {

    private readonly scopes: ScopeRegistry;

    constructor(public config: IWorkspaceConfigReader, private readonly host: HostEnvironment = NO_HOST) {
        this.scopes = new ScopeRegistry(config, () => this.getScopeRoot());
    }

    /**
     * Converts Windows-style absolute paths to a runtime-compatible path when
     * running on a non-Windows host (e.g. WSL remote).
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
        const locale = this.config.get<string>('locale');
        return nonEmpty(locale) ? locale : this.host.language;
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
        const root = (nonEmpty(raw) ? raw : '${base}/scopes').replace('${base}', base);
        const anchored = Path.isAbsolute(root) || /^(\$\{(homeDir|workspaceRoot|workspaceFolder)\}|~)/.test(root);
        return this.resolvePath(anchored ? root : Path.join(base, root));
    }

    /** Updates the scope folders found below the scope root (scanned by the host). */
    public setScopeFolders(names: string[]): void {
        this.scopes.setFolders(names);
    }

    /** ${homeDir}, ${workspaceRoot}, ${workspaceFolder} and a leading "~". */
    private resolveVariables(value: string): string {
        const workspaceRoot = this.host.workspaceRoot();
        return value
            .replace('${homeDir}', os.homedir())
            .replace('${workspaceRoot}', workspaceRoot)
            .replace('${workspaceFolder}', workspaceRoot)
            .replace(/^~(?=$|[\\/])/, os.homedir());
    }

    /**
     * Resolves the variables and normalizes the path for the runtime (used for
     * journal.base, scope bases and the scope root). A relative path is
     * relative to the workspace root, if there is one.
     */
    private resolvePath(value: string): string {
        let resolved = this.normalizeBasePathForRuntime(this.resolveVariables(value));
        const workspaceRoot = this.host.workspaceRoot();
        if (!Path.isAbsolute(resolved) && nonEmpty(workspaceRoot)) {
            resolved = Path.resolve(workspaceRoot, resolved);
        }
        return Path.format(Path.parse(Path.normalize(resolved)));
    }

    /**
     * The base path of the scope; the journal base (`journal.base`, default
     * ~/Journal) for scopes without own base.
     *
     * Supported variables: ${homeDir}, ${workspaceRoot}, ${workspaceFolder}
     */
    public getBasePath(scopeId?: string): string {
        const scopedBase = this.getScope(scopeId).base;
        if (scopedBase) { return this.resolvePath(scopedBase); }

        const base = this.config.get<string>('base');
        return nonEmpty(base) ? this.resolvePath(base) : Path.join(os.homedir(), 'Journal');
    }

    /**
     * Returns the configured base path with variable substitution but without
     * remote-runtime normalization. Intended for local handoff from a remote
     * session so the local client can open paths in its own style.
     */
    public getBasePathForLocalOpen(scopeId?: string): string {
        const base = this.getScope(scopeId).base ?? this.config.get<string>('base');
        if (!nonEmpty(base)) {
            return this.getBasePath(SCOPE_DEFAULT);
        }
        return this.resolveVariables(base);
    }

    /** True when the configured base path for a scope is a Windows absolute path (e.g. C:\\Users\\...). */
    public isWindowsStyleBaseConfigured(scopeId?: string): boolean {
        const scope = this.getScope(scopeId);
        const configuredBase = scope.isDefault ? this.config.get<string>('base') : scope.base;
        return nonEmpty(configuredBase) && /^\/?[a-zA-Z]:[\\/]/.test(configuredBase);
    }

    /** File extension for notes and journal entries, without dot. Defaults to "md". */
    public getFileExtension(): string {
        const ext = this.config.get<string>('ext');
        return nonEmpty(ext) ? ext.replace(/^\./, '') : 'md';
    }

    public getEntryGranularity(_scopeId?: string): EntryGranularity {
        return this.config.get<string>('entryGranularity') === 'weekly' ? 'weekly' : 'daily';
    }

    public getTplTime(): string | undefined {
        return this.config.get<string>('tpl-time');
    }

    public isWeeklyTemplateDates(): boolean {
        return this.config.get<boolean>('weeklyTemplateDates') === true;
    }

    /**
     * The template `id` (task, memo, …): from the scope's settings entry, else
     * `journal.templates`, else the legacy `journal.tpl-<id>` (#72), else the default.
     */
    public getInlineTemplate(id: string, defaultValue: string, scopeId?: string): InlineTemplate {
        const found = this.getScope(scopeId).template(id)
            ?? this.config.get<InlineTemplate[]>('templates')?.find(tpl => tpl.name === id);
        if (found) {
            // a copy: the settings object must not be modified
            return { ...found, template: found.template ?? defaultValue, after: found.after ?? '' };
        }
        const legacy = this.config.get<string>(`tpl-${id}`);
        if (nonEmpty(legacy)) {
            return { name: id, scope: SCOPE_DEFAULT, template: legacy, after: this.config.get<string>(`tpl-${id}-after`) ?? '' };
        }
        return { name: id, scope: SCOPE_DEFAULT, template: defaultValue, after: '' };
    }
}
