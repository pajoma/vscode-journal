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

import { IWorkspaceConfigReader, PatternDefinition } from './types';

export const DEFAULT_PATTERNS: Required<PatternDefinition> = {
    notes: { path: '${base}/${year}/${month}/${day}', file: '${input}.${ext}' },
    entries: { path: '${base}/${year}/${month}', file: '${day}.${ext}' },
    weeks: { path: '${base}/${year}', file: 'week_${week}.${ext}' },
    weeklyNotes: { path: '${base}/${year}/w${week}', file: '${input}.${ext}' },
};

/**
 * Defaults of the journal format settings, as declared in the extension's
 * package.json (`contributes.configuration`). VS Code returns them for unset
 * settings; elsewhere {@link SettingsWithDefaults} does. A unit test checks
 * them against package.json.
 */
export const SETTINGS_DEFAULTS: Record<string, unknown> = {
    'base': '',
    'ext': 'md',
    'locale': '',
    'entryGranularity': 'daily',
    'patterns': DEFAULT_PATTERNS,
    'scopeRoot': '${base}/scopes',
    'scopes': [],
    'patternHistory': [],
    'notes.ignore': [],
    'weeklyTemplateDates': false,
    'templates': [
        { name: 'memo', template: '- MEMO ${localTime}: ${input}' },
        { name: 'task', template: '- [] ${d:LL} - Task: ${input}', after: '## Tasks' },
        { name: 'entry', template: '# ${d:dddd, MMMM DD YYYY}\n\n## Tasks\n\n## Notes\n\n' },
        { name: 'time', template: '${localTime}' },
        { name: 'note', template: '# ${input}\n\n${tags}\n' },
        { name: 'files', template: '- NOTE: [${title}](${link})', after: '## Notes' },
        { name: 'weekly', template: '# Week ${week}\n\n## Tasks\n\n## Notes\n\n## Daily Entries\n\n' },
        { name: 'dailyLink', template: '- [[${d:YYYY-MM-DD}|${weekday}, ${d:MMMM DD}]]', after: '## Daily Entries' },
    ],
    // legacy single-template settings (#72), used when journal.templates has no entry of the name
    'tpl-entry': '',
    'tpl-time': '',
    'tpl-note': '',
    'tpl-memo': '- MEMO: ${input}',
    'tpl-memo-after': '',
    'tpl-task': '- [ ] TASK: ${input}',
    'tpl-task-after': '',
    'tpl-files': '',
    'tpl-files-after': '',
};

/** Settings from a plain object (keys without "journal."), with {@link SETTINGS_DEFAULTS} for unset ones. */
export class SettingsWithDefaults implements IWorkspaceConfigReader {

    constructor(private readonly values: Record<string, unknown>) { }

    get<T>(section: string, defaultValue?: T): T {
        return (this.values[section] ?? SETTINGS_DEFAULTS[section] ?? defaultValue) as T;
    }
}
