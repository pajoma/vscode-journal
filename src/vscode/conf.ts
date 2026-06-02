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

import {
    EntryGranularity, HeaderTemplate, IConfiguration, InlineTemplate, InputDetailsTimeFormat,
    IWorkspaceConfigReader, NavigationMode, ScopeDefinitionLite, ScopedTemplate, SCOPE_DEFAULT, WeeklySyncConfig,
} from '../model';
import { SettingsReader } from './config/settings-reader';
import { PathResolver } from './config/path-resolver';
import { TemplateProvider } from './config/template-provider';

export { SCOPE_DEFAULT, WeeklySyncConfig };
export { EntryGranularity, NavigationMode, ScopeDefinitionLite } from '../model/config';

/**
 * Facade over the journal configuration. Composes three focused collaborators
 * and exposes them through the {@link IConfiguration} interface:
 *  - {@link SettingsReader}   — scalar settings, base paths, scope/template definitions
 *  - {@link PathResolver}     — entry/note/weekly path & file pattern resolution
 *  - {@link TemplateProvider} — header/inline/time template resolution
 */
export class Configuration implements IConfiguration {

    private readonly settings: SettingsReader;
    private readonly paths: PathResolver;
    private readonly templates: TemplateProvider;

    constructor(public config: IWorkspaceConfigReader) {
        this.settings = new SettingsReader(config);
        this.paths = new PathResolver(config, this.settings);
        this.templates = new TemplateProvider(this.settings);
    }

    /* ----- settings ----- */
    public getLocale(): string { return this.settings.getLocale(); }
    public getScopes(): string[] { return this.settings.getScopes(); }
    public getScopeDefinitions(): ScopeDefinitionLite[] { return this.settings.getScopeDefinitions(); }
    public getNavigationMode(): NavigationMode { return this.settings.getNavigationMode(); }
    public getBasePath(scopeId?: string): string { return this.settings.getBasePath(scopeId); }
    public getBasePathForLocalOpen(scopeId?: string): string { return this.settings.getBasePathForLocalOpen(scopeId); }
    public isWindowsStyleBaseConfigured(scopeId?: string): boolean { return this.settings.isWindowsStyleBaseConfigured(scopeId); }
    public getFileExtension(scopeId?: string): string { return this.settings.getFileExtension(scopeId); }
    public isSyntaxHighlightingEnabled(): boolean { return this.settings.isSyntaxHighlightingEnabled(); }
    public getEntryGranularity(scopeId?: string): EntryGranularity { return this.settings.getEntryGranularity(scopeId); }
    public getInputDetailsTimeFormat(): InputDetailsTimeFormat { return this.settings.getInputDetailsTimeFormat(); }
    public getInputTimeThreshold(): number { return this.settings.getInputTimeThreshold(); }
    public getTplTime(): string | undefined { return this.settings.getTplTime(); }
    public isDevelopmentModeEnabled(): boolean { return this.settings.isDevelopmentModeEnabled(); }
    public isOpenInNewEditorGroup(): boolean { return this.settings.isOpenInNewEditorGroup(); }
    public getWeeklySyncConfig(scopeId?: string): WeeklySyncConfig { return this.settings.getWeeklySyncConfig(scopeId); }
    public loadInlineTemplate(id: string, defaultValue: string, scopeId?: string): Promise<InlineTemplate> {
        return this.settings.loadInlineTemplate(id, defaultValue, scopeId);
    }

    /* ----- raw path patterns ----- */
    public getNotesPathPattern(scopeId?: string): string { return this.paths.getNotesPathPattern(scopeId); }
    public getEntryPathPattern(scopeId?: string): string { return this.paths.getEntryPathPattern(scopeId); }
    public getWeeklyNotesPathPatternRaw(scopeId?: string): string { return this.paths.getWeeklyNotesPathPatternRaw(scopeId); }
    public getWeeksPathPatternRaw(scopeId?: string): string { return this.paths.getWeeksPathPatternRaw(scopeId); }
    public getWeeksFilePatternRaw(scopeId?: string): string { return this.paths.getWeeksFilePatternRaw(scopeId); }
    public getEntryFilePatternRaw(scopeId?: string): string { return this.paths.getEntryFilePatternRaw(scopeId); }
    public getNotesFilePatternRaw(scopeId?: string): string { return this.paths.getNotesFilePatternRaw(scopeId); }
    public getWeeklyNotesFilePatternRaw(scopeId?: string): string { return this.paths.getWeeklyNotesFilePatternRaw(scopeId); }
    public getWeekFilePatternRaw(scopeId?: string): string { return this.paths.getWeekFilePatternRaw(scopeId); }
    public getWeekOrEntryPathPatternRaw(scopeId?: string): string { return this.paths.getWeekOrEntryPathPatternRaw(scopeId); }

    /* ----- path resolution ----- */
    public getResolvedNotesPath(date: Date, scopeId?: string): Promise<ScopedTemplate> { return this.paths.getResolvedNotesPath(date, scopeId); }
    public getNotesFilePattern(date: Date, input: string, scopeId?: string): Promise<ScopedTemplate> { return this.paths.getNotesFilePattern(date, input, scopeId); }
    public getResolvedWeeklyNotesPath(week: number, year: number, scopeId?: string): Promise<ScopedTemplate> { return this.paths.getResolvedWeeklyNotesPath(week, year, scopeId); }
    public getWeeklyNotesFilePattern(week: number, year: number, input: string, scopeId?: string): Promise<ScopedTemplate> { return this.paths.getWeeklyNotesFilePattern(week, year, input, scopeId); }
    public getWeekFilePattern(week: Number, scopeId?: string): Promise<ScopedTemplate> { return this.paths.getWeekFilePattern(week, scopeId); }
    public getWeekPathPatternForLocalOpen(week: Number, scopeId?: string): Promise<ScopedTemplate> { return this.paths.getWeekPathPatternForLocalOpen(week, scopeId); }
    public getWeekPathPattern(week: Number, scopeId?: string): Promise<ScopedTemplate> { return this.paths.getWeekPathPattern(week, scopeId); }
    public getResolvedEntryPath(date: Date, scopeId?: string): Promise<ScopedTemplate> { return this.paths.getResolvedEntryPath(date, scopeId); }
    public getResolvedEntryPathForLocalOpen(date: Date, scopeId?: string): Promise<ScopedTemplate> { return this.paths.getResolvedEntryPathForLocalOpen(date, scopeId); }
    public getEntryFilePattern(date: Date, scopeId?: string): Promise<ScopedTemplate> { return this.paths.getEntryFilePattern(date, scopeId); }

    /* ----- templates ----- */
    public getEntryTemplate(date: Date, scopeId?: string): Promise<HeaderTemplate> { return this.templates.getEntryTemplate(date, scopeId); }
    public getWeeklyTemplate(week: Number, scopeId?: string): Promise<ScopedTemplate> { return this.templates.getWeeklyTemplate(week, scopeId); }
    public getNotesTemplate(scopeId?: string): Promise<HeaderTemplate> { return this.templates.getNotesTemplate(scopeId); }
    public getFileLinkInlineTemplate(scopeId?: string): Promise<InlineTemplate> { return this.templates.getFileLinkInlineTemplate(scopeId); }
    public getMemoInlineTemplate(scopeId?: string): Promise<InlineTemplate> { return this.templates.getMemoInlineTemplate(scopeId); }
    public getTaskInlineTemplate(scopeId?: string): Promise<InlineTemplate> { return this.templates.getTaskInlineTemplate(scopeId); }
    public getTimeString(): string | undefined { return this.templates.getTimeString(); }
    public getTimeStringTemplate(scopeId?: string): Promise<ScopedTemplate> { return this.templates.getTimeStringTemplate(scopeId); }
    public getDailyLinkInlineTemplate(scopeId?: string): Promise<InlineTemplate> { return this.templates.getDailyLinkInlineTemplate(scopeId); }
}
