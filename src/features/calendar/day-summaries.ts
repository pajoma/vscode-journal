// Copyright (C) 2026  Patrick Maué
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
'use strict';

import * as Path from 'path';
import { entrySummary, JournalPaths, JournalScopes, JournalSettings } from 'journal-core';
import { JournalFiles } from '../../shared/journal/journal-files';
import { IFileSystem } from '../../shared/model/index';
import { isJournalEntry } from '../../shared/paths';
import { DaySummary } from './calendar-model';

/**
 * The tasks and linked notes of the daily entries of the given days (#311),
 * counted like the entry list of the smart input (#7): links to other
 * entries are no notes. Days without entry are left out.
 */
export async function daySummaries(fs: IFileSystem, config: JournalSettings & JournalScopes & JournalPaths, files: JournalFiles, keys: string[]): Promise<Map<string, DaySummary>> {
    const summaries = new Map<string, DaySummary>();
    await Promise.all(keys.map(async key => {
        const file = files.days.get(key);
        if (!file) { return; }
        let text = '';
        try {
            text = new TextDecoder().decode(await fs.readFile(file));
        } catch {
            // an unreadable entry still exists
        }
        const dir = Path.dirname(file);
        const { open, tasks, notes } = entrySummary(text, target => !isJournalEntry(Path.resolve(dir, target), config));
        summaries.set(key, { open, tasks, notes });
    }));
    return summaries;
}
