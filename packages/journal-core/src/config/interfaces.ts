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

/**
 * The journal configuration, split along its seams (#278): consumers depend
 * on the part they use; {@link JournalConfiguration} implements all of them.
 */
import { Scope } from './scope';
import { EntryGranularity, HeaderTemplate, InlineTemplate, Resolved } from './types';

/** Scalar settings and base paths. */
export interface JournalSettings {
    getLocale(): string;
    /** Absolute base of the scope (the journal base if it has none). */
    getBasePath(scopeId?: string): string;
    /** The configured base with variables resolved, in the style of the client's OS (remote sessions). */
    getBasePathForLocalOpen(scopeId?: string): string;
    /** True when the configured base of the scope is a Windows path (C:\...). */
    isWindowsStyleBaseConfigured(scopeId?: string): boolean;
    /** File extension of entries and notes, without dot. */
    getFileExtension(): string;
    getEntryGranularity(scopeId?: string): EntryGranularity;
    /** `journal.weeklyTemplateDates`: resolve date variables in the weekly template (#137). */
    isWeeklyTemplateDates(): boolean;
    getTplTime(): string | undefined;
    /** A template from the scope, `journal.templates` or the legacy `journal.tpl-<id>`; else the given default. */
    getInlineTemplate(id: string, defaultValue: string, scopeId?: string): InlineTemplate;
}

/** Scopes: the default journal, `journal.scopes` entries and folders below `journal.scopeRoot`. */
export interface JournalScopes {
    /** The scope for an id; unknown ids resolve to the default scope. */
    getScope(scopeId?: string): Scope;
    /** All scopes: default, configured, folders. */
    getScopeList(): Scope[];
    /** Names of all scopes, the default scope first. */
    getScopes(): string[];
    getScopeRoot(): string;
    /** The folders found below the scope root (the host scans them). */
    setScopeFolders(names: string[]): void;
}

/** Path and file patterns of entries, weeks and notes: the raw patterns the editor needs, and resolved paths. */
export interface JournalPaths {
    getNotesPathPattern(scopeId?: string): string;
    getEntryPathPattern(scopeId?: string): string;
    getWeeksPathPatternRaw(scopeId?: string): string;
    getWeeksFilePatternRaw(scopeId?: string): string;
    getResolvedNotesPath(date: Date, scopeId?: string): Resolved;
    getNotesFilePattern(date: Date, input: string, scopeId?: string): Resolved;
    getResolvedWeeklyNotesPath(week: number, year: number, scopeId?: string): Resolved;
    getWeeklyNotesFilePattern(week: number, year: number, input: string, scopeId?: string): Resolved;
    getWeekFilePattern(week: number, year: number, scopeId?: string): Resolved;
    getWeekPathPattern(week: number, year: number, scopeId?: string): Resolved;
    getWeekPathPatternForLocalOpen(week: number, year: number, scopeId?: string): Resolved;
    getResolvedEntryPath(date: Date, scopeId?: string): Resolved;
    getResolvedEntryPathForLocalOpen(date: Date, scopeId?: string): Resolved;
    getEntryFilePattern(date: Date, scopeId?: string): Resolved;
}

/** Templates of new files and inserted lines; `template` is the raw one, `value` resolved. */
export interface JournalTemplates {
    getEntryTemplate(date: Date, scopeId?: string): Resolved<HeaderTemplate>;
    getWeeklyTemplate(week: number, year: number, scopeId?: string): Resolved;
    getNotesTemplate(scopeId?: string): Resolved<HeaderTemplate>;
    getFileLinkInlineTemplate(scopeId?: string): Resolved<InlineTemplate>;
    getMemoInlineTemplate(scopeId?: string): Resolved<InlineTemplate>;
    getTaskInlineTemplate(scopeId?: string): Resolved<InlineTemplate>;
    getTimeString(): string | undefined;
    getTimeStringTemplate(scopeId?: string): Resolved;
    getDailyLinkInlineTemplate(scopeId?: string): Resolved<InlineTemplate>;
}
