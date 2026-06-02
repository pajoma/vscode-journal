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
import { IWorkspaceConfigReader, ScopedTemplate, SCOPE_DEFAULT } from '../model/index';
import { isNullOrUndefined, replaceVariableValue } from '../index';
import { resolveDate } from '../templates/template-engine';
import { defaultPatternDefinition, PatternDefinition, ScopeDefinition } from './patterns';
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
        return (isNullOrUndefined(scopeId) || scopeId!.length === 0) ? SCOPE_DEFAULT : scopeId!;
    }

    /* ----------------------------- raw patterns ----------------------------- */

    public getNotesPathPattern(_scopeId?: string): string {
        let result: string | undefined;
        if (this.resolveScope(_scopeId) === SCOPE_DEFAULT) {
            result = this.config.get<PatternDefinition>("patterns")?.notes?.path;
        } else {
            result = this.config.get<ScopeDefinition[]>("scopes")?.find(sd => sd.name === _scopeId)?.patterns?.notes?.path;
        }
        return (isNullOrUndefined(result) || result!.length === 0) ? defaultPatternDefinition.notes.path : result!;
    }

    public getWeeklyNotesPathPatternRaw(_scopeId?: string): string {
        let result: string | undefined;
        if (this.resolveScope(_scopeId) === SCOPE_DEFAULT) {
            result = this.config.get<PatternDefinition>("patterns")?.weeklyNotes?.path;
        } else {
            result = this.config.get<ScopeDefinition[]>("scopes")?.find(sd => sd.name === _scopeId)?.patterns?.weeklyNotes?.path;
        }
        return (isNullOrUndefined(result) || result!.length === 0) ? defaultPatternDefinition.weeklyNotes!.path : result!;
    }

    public getWeeksPathPatternRaw(_scopeId?: string): string {
        let result: string | undefined;
        if (this.resolveScope(_scopeId) === SCOPE_DEFAULT) {
            result = this.config.get<PatternDefinition>("patterns")?.weeks?.path;
        } else {
            result = this.config.get<ScopeDefinition[]>("scopes")?.find(sd => sd.name === _scopeId)?.patterns?.weeks?.path;
        }
        return (isNullOrUndefined(result) || result!.length === 0) ? defaultPatternDefinition.weeks.path : result!;
    }

    public getWeeksFilePatternRaw(_scopeId?: string): string {
        let result: string | undefined;
        if (this.resolveScope(_scopeId) === SCOPE_DEFAULT) {
            result = this.config.get<PatternDefinition>("patterns")?.weeks?.file;
        } else {
            result = this.config.get<ScopeDefinition[]>("scopes")?.find(sd => sd.name === _scopeId)?.patterns?.weeks?.file;
        }
        return (isNullOrUndefined(result) || result!.length === 0) ? defaultPatternDefinition.weeks.file : result!;
    }

    public getEntryFilePatternRaw(_scopeId?: string): string {
        const scope = this.resolveScope(_scopeId);
        const result: string | undefined = scope === SCOPE_DEFAULT
            ? this.config.get<PatternDefinition>("patterns")?.entries?.file
            : this.config.get<ScopeDefinition[]>("scopes")?.find(sd => sd.name === scope)?.patterns?.entries?.file;
        return (isNullOrUndefined(result) || result!.length === 0) ? defaultPatternDefinition.entries.file : result!;
    }

    public getNotesFilePatternRaw(_scopeId?: string): string {
        const scope = this.resolveScope(_scopeId);
        const result: string | undefined = scope === SCOPE_DEFAULT
            ? this.config.get<PatternDefinition>("patterns")?.notes?.file
            : this.config.get<ScopeDefinition[]>("scopes")?.find(sd => sd.name === scope)?.patterns?.notes?.file;
        return (isNullOrUndefined(result) || result!.length === 0) ? defaultPatternDefinition.notes.file : result!;
    }

    public getWeeklyNotesFilePatternRaw(_scopeId?: string): string {
        const scope = this.resolveScope(_scopeId);
        const result: string | undefined = scope === SCOPE_DEFAULT
            ? this.config.get<PatternDefinition>("patterns")?.weeklyNotes?.file
            : this.config.get<ScopeDefinition[]>("scopes")?.find(sd => sd.name === scope)?.patterns?.weeklyNotes?.file;
        return (isNullOrUndefined(result) || result!.length === 0) ? defaultPatternDefinition.weeklyNotes!.file : result!;
    }

    public getWeekFilePatternRaw(_scopeId?: string): string {
        const scope = this.resolveScope(_scopeId);
        const result: string | undefined = scope === SCOPE_DEFAULT
            ? this.config.get<PatternDefinition>("patterns")?.weeks?.file
            : this.config.get<ScopeDefinition[]>("scopes")?.filter(sd => sd.name === scope).pop()?.patterns?.weeks?.file;
        return (isNullOrUndefined(result) || result!.length === 0) ? defaultPatternDefinition.weeks.file : result!;
    }

    /** Scoped fallback reads entries.path — preserves existing getWeekPathPattern behavior. */
    public getWeekOrEntryPathPatternRaw(_scopeId?: string): string {
        const scope = this.resolveScope(_scopeId);
        const result: string | undefined = scope === SCOPE_DEFAULT
            ? this.config.get<PatternDefinition>("patterns")?.weeks?.path
            : this.config.get<ScopeDefinition[]>("scopes")?.filter(sd => sd.name === scope).pop()?.patterns?.entries?.path;
        return (isNullOrUndefined(result) || result!.length === 0) ? defaultPatternDefinition.entries.path : result!;
    }

    public getEntryPathPattern(_scopeId?: string): string {
        let result: string | undefined;
        if (this.resolveScope(_scopeId) === SCOPE_DEFAULT) {
            result = this.config.get<PatternDefinition>("patterns")?.["entries"]?.path;
        } else {
            result = this.config.get<ScopeDefinition[]>("scopes")?.filter(sd => sd.name === _scopeId).pop()?.patterns?.entries?.path;
        }
        return (isNullOrUndefined(result) || result!.length === 0) ? defaultPatternDefinition.entries.path : result!;
    }

    /* ----------------------------- resolution ----------------------------- */

    public async getResolvedNotesPath(date: Date, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = {
            scope: (this.resolveScope(scopeId) === SCOPE_DEFAULT) ? SCOPE_DEFAULT : scopeId!,
            template: this.getNotesPathPattern(scopeId)
        };
        scopedTemplate.value = scopedTemplate.template;
        scopedTemplate.value = replaceVariableValue("homeDir", os.homedir(), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("base", this.settings.getBasePath(scopeId), scopedTemplate.value);
        scopedTemplate.value = resolveDate(scopedTemplate.value, date, this.settings.getLocale());
        return scopedTemplate;
    }

    public async getNotesFilePattern(date: Date, input: string, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = { scope: SCOPE_DEFAULT, template: "" };
        if (this.resolveScope(scopeId) !== SCOPE_DEFAULT) { scopedTemplate.scope = scopeId!; }
        scopedTemplate.template = this.getNotesFilePatternRaw(scopeId);
        scopedTemplate.value = replaceVariableValue("ext", this.settings.getFileExtension(), scopedTemplate.template);
        scopedTemplate.value = replaceVariableValue("input", input, scopedTemplate.value);
        scopedTemplate.value = resolveDate(scopedTemplate.value, date, this.settings.getLocale());
        return scopedTemplate;
    }

    public async getResolvedWeeklyNotesPath(week: number, year: number, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = {
            scope: (this.resolveScope(scopeId) === SCOPE_DEFAULT) ? SCOPE_DEFAULT : scopeId!,
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
        const scopedTemplate: ScopedTemplate = { scope: SCOPE_DEFAULT, template: "" };
        if (this.resolveScope(scopeId) !== SCOPE_DEFAULT) { scopedTemplate.scope = scopeId!; }
        scopedTemplate.template = this.getWeeklyNotesFilePatternRaw(scopeId);
        scopedTemplate.value = replaceVariableValue("ext", this.settings.getFileExtension(), scopedTemplate.template);
        scopedTemplate.value = replaceVariableValue("input", input, scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("year", String(year), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("week", String(week), scopedTemplate.value);
        return scopedTemplate;
    }

    public async getWeekFilePattern(week: Number, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = { scope: SCOPE_DEFAULT, template: "" };
        if (this.resolveScope(scopeId) !== SCOPE_DEFAULT) { scopedTemplate.scope = scopeId!; }
        scopedTemplate.value = this.getWeekFilePatternRaw(scopeId);
        scopedTemplate.value = replaceVariableValue("ext", this.settings.getFileExtension(), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("week", week + "", scopedTemplate.value);
        scopedTemplate.value = resolveDate(scopedTemplate.value, new Date(), this.settings.getLocale());
        return scopedTemplate;
    }

    public async getWeekPathPatternForLocalOpen(week: Number, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = { scope: SCOPE_DEFAULT, template: "" };
        if (this.resolveScope(scopeId) !== SCOPE_DEFAULT) { scopedTemplate.scope = scopeId!; }
        scopedTemplate.template = this.getWeekOrEntryPathPatternRaw(scopeId);
        scopedTemplate.value = scopedTemplate.template;
        scopedTemplate.value = replaceVariableValue("base", this.settings.getBasePathForLocalOpen(scopeId), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("week", week + "", scopedTemplate.value);
        scopedTemplate.value = resolveDate(scopedTemplate.value, new Date(), this.settings.getLocale());
        return scopedTemplate;
    }

    public async getWeekPathPattern(week: Number, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = { scope: SCOPE_DEFAULT, template: "" };
        if (this.resolveScope(scopeId) !== SCOPE_DEFAULT) { scopedTemplate.scope = scopeId!; }
        scopedTemplate.template = this.getWeekOrEntryPathPatternRaw(scopeId);
        scopedTemplate.value = scopedTemplate.template;
        scopedTemplate.value = replaceVariableValue("base", this.settings.getBasePath(scopeId), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("week", week + "", scopedTemplate.value);
        scopedTemplate.value = resolveDate(scopedTemplate.value, new Date(), this.settings.getLocale());
        scopedTemplate.value = Path.normalize(scopedTemplate.value);
        return scopedTemplate;
    }

    public async getResolvedEntryPath(date: Date, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = {
            scope: (this.resolveScope(scopeId) === SCOPE_DEFAULT) ? SCOPE_DEFAULT : scopeId!,
            template: this.getEntryPathPattern(scopeId)
        };
        scopedTemplate.value = replaceVariableValue("base", this.settings.getBasePath(scopeId), scopedTemplate.template);
        scopedTemplate.value = resolveDate(scopedTemplate.value, date, this.settings.getLocale());
        scopedTemplate.value = Path.normalize(scopedTemplate.value);
        return scopedTemplate;
    }

    public async getResolvedEntryPathForLocalOpen(date: Date, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = {
            scope: (this.resolveScope(scopeId) === SCOPE_DEFAULT) ? SCOPE_DEFAULT : scopeId!,
            template: this.getEntryPathPattern(scopeId)
        };
        scopedTemplate.value = replaceVariableValue("base", this.settings.getBasePathForLocalOpen(scopeId), scopedTemplate.template);
        scopedTemplate.value = resolveDate(scopedTemplate.value, date, this.settings.getLocale());
        // Do not use Path.normalize here — may use remote OS separators conflicting with local Windows paths.
        return scopedTemplate;
    }

    public async getEntryFilePattern(date: Date, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = { scope: SCOPE_DEFAULT, template: "" };
        if (this.resolveScope(scopeId) !== SCOPE_DEFAULT) { scopedTemplate.scope = scopeId!; }
        scopedTemplate.template = this.getEntryFilePatternRaw(scopeId);
        scopedTemplate.value = replaceVariableValue("ext", this.settings.getFileExtension(scopeId), scopedTemplate.template);
        scopedTemplate.value = resolveDate(scopedTemplate.value, date, this.settings.getLocale());
        return scopedTemplate;
    }
}
