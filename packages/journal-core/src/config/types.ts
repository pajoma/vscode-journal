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

/** Where the notes of one day lie and which files in that folder they are (#279). */
export interface NotesOfDay {
    folder: string;
    /** Whether the notes pattern names the day; otherwise a note's day is the day its file was created. */
    dated: boolean;
    /** Whether a file of the folder is a note of the day; `created` is the file's creation time (not its modification time). */
    includes(name: string, created?: Date): boolean;
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
    /** The scope's earlier layouts, newest first; see {@link LayoutDefinition}. */
    patternHistory?: LayoutDefinition[];
    templates?: InlineTemplate[];
};

/**
 * An earlier layout of the journal, as an entry of `journal.patternHistory`
 * (or of a scope's `patternHistory`): what `journal.patterns` and
 * `journal.ext` were before they were changed (#309). Unset patterns are the
 * defaults, an unset extension is the current one; `until` is the day the
 * layout was replaced (for the user, it does not limit the lookup).
 */
export type LayoutDefinition = {
    until?: string;
    patterns?: Partial<PatternDefinition>;
    ext?: string;
};

/** One layout with every pattern set: the current one, one of the history or the defaults (#309). */
export interface Layout {
    patterns: Required<PatternDefinition>;
    ext: string;
    /** Set for a layout of the history: the day it was replaced. */
    until?: string;
    /** The layout new files are written to. */
    current: boolean;
}

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
