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
import { IWorkspaceConfigReader, ScopedTemplate } from '../model/index';
import { replaceVariableValue, stringIsNotEmpty } from '../index';
import { getDatesOfISOWeek } from '../dates/dates';
import { resolveDate } from '../templates/template-engine';
import { defaultPatternDefinition, PatternDefinition } from './patterns';
import { IJournalSettings } from './settings-reader';

/**
 * Resolves entry / note / weekly path and file templates. Reads the raw
 * `journal.patterns` settings and substitutes date/base/ext variables. Pure
 * logic — no VS Code dependency; settings access goes through {@link IJournalSettings}.
 */
export class PathResolver {

    constructor(
        private readonly config: IWorkspaceConfigReader,
        private readonly settings: IJournalSettings,
    ) { }

    private resolveScope(scopeId?: string): string {
        return this.settings.getScope(scopeId).name;
    }

    /**
     * A raw pattern part: from the scope's settings entry, or from `journal.patterns`
     * for the default scope; the extension default if not set. A scope does not
     * inherit `journal.patterns` (existing behaviour).
     */
    private pattern(scopeId: string | undefined, kind: keyof PatternDefinition, part: 'path' | 'file'): string {
        const scope = this.settings.getScope(scopeId);
        const value = scope.isDefault ? this.globalPattern(kind, part) : scope.pattern(kind, part);
        return value ?? defaultPatternDefinition[kind]![part];
    }

    /** A part of `journal.patterns`; undefined if not set. */
    private globalPattern(kind: keyof PatternDefinition, part: 'path' | 'file'): string | undefined {
        const value = this.config.get<PatternDefinition>("patterns")?.[kind]?.[part];
        return stringIsNotEmpty(value) ? value : undefined;
    }

    /* ----------------------------- raw patterns ----------------------------- */

    public getNotesPathPattern(_scopeId?: string): string {
        return this.settings.getScope(_scopeId).notesFolder ?? this.pattern(_scopeId, 'notes', 'path');
    }

    public getWeeklyNotesPathPatternRaw(_scopeId?: string): string { return this.pattern(_scopeId, 'weeklyNotes', 'path'); }
    public getWeeksPathPatternRaw(_scopeId?: string): string { return this.pattern(_scopeId, 'weeks', 'path'); }
    public getWeeksFilePatternRaw(_scopeId?: string): string { return this.pattern(_scopeId, 'weeks', 'file'); }
    public getEntryFilePatternRaw(_scopeId?: string): string { return this.pattern(_scopeId, 'entries', 'file'); }
    public getNotesFilePatternRaw(_scopeId?: string): string { return this.pattern(_scopeId, 'notes', 'file'); }
    public getWeeklyNotesFilePatternRaw(_scopeId?: string): string { return this.pattern(_scopeId, 'weeklyNotes', 'file'); }
    public getWeekFilePatternRaw(_scopeId?: string): string { return this.pattern(_scopeId, 'weeks', 'file'); }
    public getEntryPathPattern(_scopeId?: string): string { return this.pattern(_scopeId, 'entries', 'path'); }

    /** Default scope: weeks.path; a scope: its entries.path. Falls back to the default entries path (existing behaviour). */
    public getWeekOrEntryPathPatternRaw(_scopeId?: string): string {
        const scope = this.settings.getScope(_scopeId);
        const value = scope.isDefault ? this.globalPattern('weeks', 'path') : scope.pattern('entries', 'path');
        return value ?? defaultPatternDefinition.entries.path;
    }

    /* ----------------------------- resolution ----------------------------- */

    public async getResolvedNotesPath(date: Date, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = {
            scope: this.resolveScope(scopeId),
            template: this.getNotesPathPattern(scopeId)
        };
        scopedTemplate.value = scopedTemplate.template;
        scopedTemplate.value = replaceVariableValue("homeDir", os.homedir(), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("base", this.settings.getBasePath(scopeId), scopedTemplate.value);
        scopedTemplate.value = resolveDate(scopedTemplate.value, date, this.settings.getLocale());
        return scopedTemplate;
    }

    public async getNotesFilePattern(date: Date, input: string, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = { scope: this.resolveScope(scopeId), template: "" };
        scopedTemplate.template = this.getNotesFilePatternRaw(scopeId);
        scopedTemplate.value = replaceVariableValue("ext", this.settings.getFileExtension(), scopedTemplate.template);
        scopedTemplate.value = replaceVariableValue("input", input, scopedTemplate.value);
        scopedTemplate.value = resolveDate(scopedTemplate.value, date, this.settings.getLocale());
        return scopedTemplate;
    }

    public async getResolvedWeeklyNotesPath(week: number, year: number, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = {
            scope: this.resolveScope(scopeId),
            template: this.getWeeklyNotesPathPatternRaw(scopeId)
        };
        scopedTemplate.value = scopedTemplate.template;
        scopedTemplate.value = replaceVariableValue("homeDir", os.homedir(), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("base", this.settings.getBasePath(scopeId), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("year", String(year), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("week", String(week), scopedTemplate.value);
        return scopedTemplate;
    }

    public async getWeeklyNotesFilePattern(week: number, year: number, input: string, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = { scope: this.resolveScope(scopeId), template: "" };
        scopedTemplate.template = this.getWeeklyNotesFilePatternRaw(scopeId);
        scopedTemplate.value = replaceVariableValue("ext", this.settings.getFileExtension(), scopedTemplate.template);
        scopedTemplate.value = replaceVariableValue("input", input, scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("year", String(year), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("week", String(week), scopedTemplate.value);
        return scopedTemplate;
    }

    public async getWeekFilePattern(week: number, year: number, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = { scope: this.resolveScope(scopeId), template: "" };
        scopedTemplate.template = this.getWeekFilePatternRaw(scopeId);
        scopedTemplate.value = replaceVariableValue("ext", this.settings.getFileExtension(), scopedTemplate.template);
        scopedTemplate.value = this.resolveWeek(scopedTemplate.value, week, year);
        return scopedTemplate;
    }

    public async getWeekPathPatternForLocalOpen(week: number, year: number, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = { scope: this.resolveScope(scopeId), template: "" };
        scopedTemplate.template = this.getWeekOrEntryPathPatternRaw(scopeId);
        scopedTemplate.value = replaceVariableValue("base", this.settings.getBasePathForLocalOpen(scopeId), scopedTemplate.template);
        scopedTemplate.value = this.resolveWeek(scopedTemplate.value, week, year);
        return scopedTemplate;
    }

    public async getWeekPathPattern(week: number, year: number, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = { scope: this.resolveScope(scopeId), template: "" };
        scopedTemplate.template = this.getWeekOrEntryPathPatternRaw(scopeId);
        scopedTemplate.value = replaceVariableValue("base", this.settings.getBasePath(scopeId), scopedTemplate.template);
        scopedTemplate.value = Path.normalize(this.resolveWeek(scopedTemplate.value, week, year));
        return scopedTemplate;
    }

    /**
     * Fills a weekly pattern: `${week}`, `${year}` as the year the week belongs
     * to, and the other date variables from the first day of the week, as the
     * MCP server does (#250). Today's date would give the wrong year around New Year.
     */
    private resolveWeek(value: string, week: number, year: number): string {
        const locale = this.settings.getLocale();
        value = replaceVariableValue("week", String(week), value);
        value = replaceVariableValue("year", String(year), value);
        return resolveDate(value, getDatesOfISOWeek(week, year, locale)[0], locale);
    }

    public async getResolvedEntryPath(date: Date, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = {
            scope: this.resolveScope(scopeId),
            template: this.getEntryPathPattern(scopeId)
        };
        scopedTemplate.value = replaceVariableValue("base", this.settings.getBasePath(scopeId), scopedTemplate.template);
        scopedTemplate.value = resolveDate(scopedTemplate.value, date, this.settings.getLocale());
        scopedTemplate.value = Path.normalize(scopedTemplate.value);
        return scopedTemplate;
    }

    public async getResolvedEntryPathForLocalOpen(date: Date, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = {
            scope: this.resolveScope(scopeId),
            template: this.getEntryPathPattern(scopeId)
        };
        scopedTemplate.value = replaceVariableValue("base", this.settings.getBasePathForLocalOpen(scopeId), scopedTemplate.template);
        scopedTemplate.value = resolveDate(scopedTemplate.value, date, this.settings.getLocale());
        // Do not use Path.normalize here — may use remote OS separators conflicting with local Windows paths.
        return scopedTemplate;
    }

    public async getEntryFilePattern(date: Date, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = { scope: this.resolveScope(scopeId), template: "" };
        scopedTemplate.template = this.getEntryFilePatternRaw(scopeId);
        scopedTemplate.value = replaceVariableValue("ext", this.settings.getFileExtension(scopeId), scopedTemplate.template);
        scopedTemplate.value = resolveDate(scopedTemplate.value, date, this.settings.getLocale());
        return scopedTemplate;
    }
}
