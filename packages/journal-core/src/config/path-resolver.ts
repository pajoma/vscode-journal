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
import { replaceVariable, resolveDate } from '../template';
import { firstDayOfWeek } from '../weeks';
import { DEFAULT_PATTERNS } from './defaults';
import { JournalPaths, JournalScopes, JournalSettings } from './interfaces';
import { nonEmpty } from './strings';
import { IWorkspaceConfigReader, PatternDefinition, Resolved } from './types';

/**
 * Resolves entry / note / weekly path and file patterns: reads the raw
 * `journal.patterns` (or the scope's) and substitutes the base, extension,
 * input and date variables.
 */
export class PathResolver implements JournalPaths {

    constructor(
        private readonly config: IWorkspaceConfigReader,
        private readonly settings: JournalSettings & JournalScopes,
    ) { }

    /**
     * A raw pattern part: from the scope's settings entry, or from `journal.patterns`
     * for the default scope; the default if not set. A scope does not
     * inherit `journal.patterns` (existing behaviour).
     */
    private pattern(scopeId: string | undefined, kind: keyof PatternDefinition, part: 'path' | 'file'): string {
        const scope = this.settings.getScope(scopeId);
        const value = scope.isDefault ? this.globalPattern(kind, part) : scope.pattern(kind, part);
        return value ?? DEFAULT_PATTERNS[kind][part];
    }

    /** A part of `journal.patterns`; undefined if not set. */
    private globalPattern(kind: keyof PatternDefinition, part: 'path' | 'file'): string | undefined {
        const value = this.config.get<PatternDefinition>('patterns')?.[kind]?.[part];
        return nonEmpty(value) ? value : undefined;
    }

    /** A pattern of the scope with its resolved value. */
    private scoped(scopeId: string | undefined, template: string, resolve: (value: string) => string): Resolved {
        return { scope: this.settings.getScope(scopeId).name, template, value: resolve(template) };
    }

    /** ${homeDir} and ${base}. */
    private withBase(value: string, base: string): string {
        return replaceVariable(replaceVariable(value, 'homeDir', os.homedir()), 'base', base);
    }

    /* ----------------------------- raw patterns ----------------------------- */

    public getNotesPathPattern(scopeId?: string): string {
        return this.settings.getScope(scopeId).notesFolder ?? this.pattern(scopeId, 'notes', 'path');
    }

    public getWeeklyNotesPathPatternRaw(scopeId?: string): string { return this.pattern(scopeId, 'weeklyNotes', 'path'); }
    public getWeeksPathPatternRaw(scopeId?: string): string { return this.pattern(scopeId, 'weeks', 'path'); }
    public getWeeksFilePatternRaw(scopeId?: string): string { return this.pattern(scopeId, 'weeks', 'file'); }
    public getEntryFilePatternRaw(scopeId?: string): string { return this.pattern(scopeId, 'entries', 'file'); }
    public getNotesFilePatternRaw(scopeId?: string): string { return this.pattern(scopeId, 'notes', 'file'); }
    public getWeeklyNotesFilePatternRaw(scopeId?: string): string { return this.pattern(scopeId, 'weeklyNotes', 'file'); }
    public getEntryPathPattern(scopeId?: string): string { return this.pattern(scopeId, 'entries', 'path'); }

    /** Default scope: weeks.path; a scope: its entries.path. Falls back to the default entries path (existing behaviour). */
    public getWeekOrEntryPathPatternRaw(scopeId?: string): string {
        const scope = this.settings.getScope(scopeId);
        const value = scope.isDefault ? this.globalPattern('weeks', 'path') : scope.pattern('entries', 'path');
        return value ?? DEFAULT_PATTERNS.entries.path;
    }

    /* ----------------------------- resolution ----------------------------- */

    public getResolvedNotesPath(date: Date, scopeId?: string): Resolved {
        return this.scoped(scopeId, this.getNotesPathPattern(scopeId), value =>
            this.resolveDate(this.withBase(value, this.settings.getBasePath(scopeId)), date));
    }

    public getNotesFilePattern(date: Date, input: string, scopeId?: string): Resolved {
        return this.scoped(scopeId, this.getNotesFilePatternRaw(scopeId), value =>
            this.resolveDate(this.withInput(value, input), date));
    }

    public getResolvedWeeklyNotesPath(week: number, year: number, scopeId?: string): Resolved {
        return this.scoped(scopeId, this.getWeeklyNotesPathPatternRaw(scopeId), value =>
            this.withWeekNumber(this.withBase(value, this.settings.getBasePath(scopeId)), week, year));
    }

    public getWeeklyNotesFilePattern(week: number, year: number, input: string, scopeId?: string): Resolved {
        return this.scoped(scopeId, this.getWeeklyNotesFilePatternRaw(scopeId), value =>
            this.withWeekNumber(this.withInput(value, input), week, year));
    }

    public getWeekFilePattern(week: number, year: number, scopeId?: string): Resolved {
        return this.scoped(scopeId, this.getWeeksFilePatternRaw(scopeId), value =>
            this.resolveWeek(replaceVariable(value, 'ext', this.settings.getFileExtension()), week, year));
    }

    public getWeekPathPatternForLocalOpen(week: number, year: number, scopeId?: string): Resolved {
        return this.scoped(scopeId, this.getWeekOrEntryPathPatternRaw(scopeId), value =>
            this.resolveWeek(this.withBase(value, this.settings.getBasePathForLocalOpen(scopeId)), week, year));
    }

    public getWeekPathPattern(week: number, year: number, scopeId?: string): Resolved {
        return this.scoped(scopeId, this.getWeekOrEntryPathPatternRaw(scopeId), value =>
            Path.normalize(this.resolveWeek(this.withBase(value, this.settings.getBasePath(scopeId)), week, year)));
    }

    public getResolvedEntryPath(date: Date, scopeId?: string): Resolved {
        return this.scoped(scopeId, this.getEntryPathPattern(scopeId), value =>
            Path.normalize(this.resolveDate(this.withBase(value, this.settings.getBasePath(scopeId)), date)));
    }

    public getResolvedEntryPathForLocalOpen(date: Date, scopeId?: string): Resolved {
        // no Path.normalize: it would use the remote OS separators, which conflict with local Windows paths
        return this.scoped(scopeId, this.getEntryPathPattern(scopeId), value =>
            this.resolveDate(this.withBase(value, this.settings.getBasePathForLocalOpen(scopeId)), date));
    }

    public getEntryFilePattern(date: Date, scopeId?: string): Resolved {
        return this.scoped(scopeId, this.getEntryFilePatternRaw(scopeId), value =>
            this.resolveDate(replaceVariable(value, 'ext', this.settings.getFileExtension()), date));
    }

    private resolveDate(value: string, date: Date): string {
        return resolveDate(value, date, this.settings.getLocale());
    }

    /** ${ext} and ${input}. */
    private withInput(value: string, input: string): string {
        return replaceVariable(replaceVariable(value, 'ext', this.settings.getFileExtension()), 'input', input);
    }

    /** Only ${year} and ${week}, as weekly notes have always been resolved. */
    private withWeekNumber(value: string, week: number, year: number): string {
        return replaceVariable(replaceVariable(value, 'year', String(year)), 'week', String(week));
    }

    /**
     * Fills a weekly pattern: `${week}`, `${year}` as the year the week belongs
     * to, and the other date variables from the first day of the week (#250).
     * Today's date would give the wrong year around New Year.
     */
    private resolveWeek(value: string, week: number, year: number): string {
        const locale = this.settings.getLocale();
        return resolveDate(this.withWeekNumber(value, week, year), firstDayOfWeek(week, year, locale), locale);
    }
}
