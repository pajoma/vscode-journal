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

import { JournalConfiguration } from 'journal-core';
import { HostEnvironment, IConfiguration, InputDetailsTimeFormat, IWorkspaceConfigReader, NavigationMode, NO_HOST, SCOPE_DEFAULT, SEARCH_DEFAULTS, SearchSettings, WeeklySyncConfig } from '../model';

export { SCOPE_DEFAULT, WeeklySyncConfig };
export { EntryGranularity, NavigationMode } from '../model/config';

/**
 * The extension's configuration: the journal format configuration shared with
 * the MCP server ({@link JournalConfiguration}, journal-core, #250) plus the
 * settings of the editor integration.
 */
export class Configuration extends JournalConfiguration implements IConfiguration {

    constructor(config: IWorkspaceConfigReader, host: HostEnvironment = NO_HOST) {
        super(config, host);
    }

    public getNavigationMode(): NavigationMode {
        return (this.config.get<string>('navigation.mode') ?? 'existing') as NavigationMode;
    }

    /**
     * Output format for the calendar quick-picker description.
     * FIXME: Externalise to properties (multilanguage)
     */
    public getInputDetailsTimeFormat(): InputDetailsTimeFormat {
        let labels: string[] = new Array(4);
        const locale = this.getLocale();

        if (locale.startsWith("en")) {
            labels = ["for today", "for tomorrow", "for yesterday", "last"];
        } else if (locale.startsWith("de")) {
            labels = ["für heute", "für morgen", " für gestern", "letzten"];
        } else if (locale.startsWith("fr")) {
            labels = ["pour aujourd'hui", "pour demain", "d'hier"];
        } else if (locale.startsWith("es")) {
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
        const d: Date = new Date();
        d.setDate(d.getDate() - 60);
        return d.getTime();
    }

    public isDevelopmentModeEnabled(): boolean {
        return this.config.get<boolean>('dev') ?? false;
    }

    public isOpenInNewEditorGroup(): boolean {
        return this.config.get<boolean>('openInNewEditorGroup') ?? false;
    }

    /** `journal.search.*`; invalid values fall back to the defaults. */
    public getSearchSettings(): SearchSettings {
        const value = <T>(key: keyof SearchSettings, valid: (v: unknown) => boolean): T => {
            const v = this.config.get<unknown>(`search.${key}`);
            return (valid(v) ? v : SEARCH_DEFAULTS[key]) as T;
        };
        const oneOf = (...values: string[]) => (v: unknown) => typeof v === 'string' && values.includes(v);
        const isBoolean = (v: unknown) => typeof v === 'boolean';
        return {
            enabled: value('enabled', isBoolean),
            indexOnStartup: value('indexOnStartup', oneOf('local', 'always', 'never')),
            content: value('content', isBoolean),
            recency: value('recency', oneOf('off', 'low', 'default', 'high')),
            maxResults: value('maxResults', v => Number.isInteger(v) && (v as number) > 0),
        };
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
}
