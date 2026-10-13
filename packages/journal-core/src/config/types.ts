// Copyright (C) 2026 Patrick Maué
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

/** Name of the default scope (the journal itself). */
export const SCOPE_DEFAULT = 'default';

/** A template or pattern of a scope, with its resolved value. */
export interface ScopedTemplate {
    name?: string;
    scope?: string;
    template: string;
    value?: string;
}

/** Where the notes of one day lie: files in `folder` whose name matches `file` (#279). */
export interface NotesOfDay {
    folder: string;
    file: RegExp;
}

/** A template with its value resolved, as the path resolver and the template provider return it. */
export type Resolved<T extends ScopedTemplate = ScopedTemplate> = T & { value: string };

export interface HeaderTemplate extends ScopedTemplate {
}

export interface InlineTemplate extends ScopedTemplate {
    /** Line after which the template is inserted ('' = below the header). */
    after: string;
}

export type EntryGranularity = 'daily' | 'weekly';

/** Shape of the `journal.patterns` setting. */
export type PatternDefinition = {
    notes: { path: string; file: string };
    entries: { path: string; file: string };
    weeks: { path: string; file: string };
    weeklyNotes?: { path: string; file: string };
};

/** Shape of a single entry in the `journal.scopes` setting. */
export type ScopeDefinition = {
    name: string;
    base?: string;
    patterns?: Partial<PatternDefinition>;
    templates?: InlineTemplate[];
};

/** Reads `journal.*` settings by key without the prefix, like VS Code's WorkspaceConfiguration. */
export interface IWorkspaceConfigReader {
    get<T>(section: string): T | undefined;
    get<T>(section: string, defaultValue: T): T;
}

/**
 * What the configuration needs from its host, as values: the UI language and
 * the workspace root (VS Code), or the journal repository (MCP server) (#251).
 */
export interface HostEnvironment {
    /** Used when `journal.locale` is empty. */
    readonly language: string;
    /** `${workspaceRoot}`, and the folder relative bases are resolved against; '' without one. Read on every use. */
    workspaceRoot(): string;
}

/** Host environment without a workspace (tests, tools): English. */
export const NO_HOST: HostEnvironment = { language: 'en', workspaceRoot: () => '' };
