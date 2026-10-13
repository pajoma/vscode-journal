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

import { JournalPaths, JournalScopes, JournalSettings, JournalTemplates } from './interfaces';
import { PathResolver } from './path-resolver';
import { Scope } from './scope';
import { SettingsReader } from './settings-reader';
import { TemplateProvider } from './template-provider';
import { EntryGranularity, HeaderTemplate, HostEnvironment, InlineTemplate, IWorkspaceConfigReader, NO_HOST, NotesOfDay, Resolved } from './types';

/**
 * Facade over the journal configuration, the same for the extension and the
 * MCP server (#250). Composes three collaborators:
 *  - {@link SettingsReader}   — scalar settings, base paths, scopes, template definitions
 *  - {@link PathResolver}     — entry/note/weekly path & file pattern resolution
 *  - {@link TemplateProvider} — header/inline/time template resolution
 */
export class JournalConfiguration implements JournalSettings, JournalScopes, JournalPaths, JournalTemplates {

    private readonly settings: SettingsReader;
    private readonly paths: PathResolver;
    private readonly templates: TemplateProvider;

    constructor(public readonly config: IWorkspaceConfigReader, host: HostEnvironment = NO_HOST) {
        this.settings = new SettingsReader(config, host);
        this.paths = new PathResolver(config, this.settings);
        this.templates = new TemplateProvider(this.settings);
    }

    /* ----- settings ----- */
    public getLocale(): string { return this.settings.getLocale(); }
    public getBasePath(scopeId?: string): string { return this.settings.getBasePath(scopeId); }
    public getBasePathForLocalOpen(scopeId?: string): string { return this.settings.getBasePathForLocalOpen(scopeId); }
    public isWindowsStyleBaseConfigured(scopeId?: string): boolean { return this.settings.isWindowsStyleBaseConfigured(scopeId); }
    public getFileExtension(): string { return this.settings.getFileExtension(); }
    public getEntryGranularity(scopeId?: string): EntryGranularity { return this.settings.getEntryGranularity(scopeId); }
    public isWeeklyTemplateDates(): boolean { return this.settings.isWeeklyTemplateDates(); }
    public getTplTime(): string | undefined { return this.settings.getTplTime(); }
    public getInlineTemplate(id: string, defaultValue: string, scopeId?: string): InlineTemplate {
        return this.settings.getInlineTemplate(id, defaultValue, scopeId);
    }

    /* ----- scopes ----- */
    public getScope(scopeId?: string): Scope { return this.settings.getScope(scopeId); }
    public getScopeList(): Scope[] { return this.settings.getScopeList(); }
    public getScopes(): string[] { return this.settings.getScopes(); }
    public getScopeRoot(): string { return this.settings.getScopeRoot(); }
    public setScopeFolders(names: string[]): void { this.settings.setScopeFolders(names); }

    /* ----- raw path patterns ----- */
    public getNotesPathPattern(scopeId?: string): string { return this.paths.getNotesPathPattern(scopeId); }
    public getEntryPathPattern(scopeId?: string): string { return this.paths.getEntryPathPattern(scopeId); }
    public getWeeksPathPatternRaw(scopeId?: string): string { return this.paths.getWeeksPathPatternRaw(scopeId); }
    public getWeeksFilePatternRaw(scopeId?: string): string { return this.paths.getWeeksFilePatternRaw(scopeId); }

    /* ----- path resolution ----- */
    public getResolvedNotesPath(date: Date, scopeId?: string): Resolved { return this.paths.getResolvedNotesPath(date, scopeId); }
    public getNotesFilePattern(date: Date, input: string, scopeId?: string): Resolved { return this.paths.getNotesFilePattern(date, input, scopeId); }
    public getResolvedWeeklyNotesPath(week: number, year: number, scopeId?: string): Resolved { return this.paths.getResolvedWeeklyNotesPath(week, year, scopeId); }
    public getWeeklyNotesFilePattern(week: number, year: number, input: string, scopeId?: string): Resolved { return this.paths.getWeeklyNotesFilePattern(week, year, input, scopeId); }
    public getWeekFilePattern(week: number, year: number, scopeId?: string): Resolved { return this.paths.getWeekFilePattern(week, year, scopeId); }
    public getWeekPathPattern(week: number, year: number, scopeId?: string): Resolved { return this.paths.getWeekPathPattern(week, year, scopeId); }
    public getWeekPathPatternForLocalOpen(week: number, year: number, scopeId?: string): Resolved { return this.paths.getWeekPathPatternForLocalOpen(week, year, scopeId); }
    public getResolvedEntryPath(date: Date, scopeId?: string): Resolved { return this.paths.getResolvedEntryPath(date, scopeId); }
    public getResolvedEntryPathForLocalOpen(date: Date, scopeId?: string): Resolved { return this.paths.getResolvedEntryPathForLocalOpen(date, scopeId); }
    public getEntryFilePattern(date: Date, scopeId?: string): Resolved { return this.paths.getEntryFilePattern(date, scopeId); }
    public getNotesOfDay(date: Date, scopeId?: string): NotesOfDay { return this.paths.getNotesOfDay(date, scopeId); }

    /* ----- templates ----- */
    public getEntryTemplate(date: Date, scopeId?: string): Resolved<HeaderTemplate> { return this.templates.getEntryTemplate(date, scopeId); }
    public getWeeklyTemplate(week: number, year: number, scopeId?: string): Resolved { return this.templates.getWeeklyTemplate(week, year, scopeId); }
    public getNotesTemplate(scopeId?: string): Resolved<HeaderTemplate> { return this.templates.getNotesTemplate(scopeId); }
    public getFileLinkInlineTemplate(scopeId?: string): Resolved<InlineTemplate> { return this.templates.getFileLinkInlineTemplate(scopeId); }
    public getMemoInlineTemplate(scopeId?: string): Resolved<InlineTemplate> { return this.templates.getMemoInlineTemplate(scopeId); }
    public getTaskInlineTemplate(scopeId?: string): Resolved<InlineTemplate> { return this.templates.getTaskInlineTemplate(scopeId); }
    public getTimeString(): string | undefined { return this.templates.getTimeString(); }
    public getTimeStringTemplate(scopeId?: string): Resolved { return this.templates.getTimeStringTemplate(scopeId); }
    public getDailyLinkInlineTemplate(scopeId?: string): Resolved<InlineTemplate> { return this.templates.getDailyLinkInlineTemplate(scopeId); }
}
