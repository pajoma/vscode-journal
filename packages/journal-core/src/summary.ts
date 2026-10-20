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

import { linkTargets } from './links';
import { CHECKBOX } from './tasks';

/** What an entry holds, as the entry picker shows it next to the entry (#7). */
export interface EntrySummary {
    /** Open tasks ("[ ]"). */
    open: number;
    /** Open and done tasks; moved tasks ("[>]") live on in another entry and are not counted. */
    tasks: number;
    /** Distinct local files the entry links that are notes (notes and attachments by default), not web or mail links. */
    notes: number;
}

/** A link target with a scheme (https:, mailto:, file:) or only an anchor (#heading). */
const NOT_A_FILE = /^(?:[a-z][a-z0-9+.-]+:|#)/i;

/**
 * Counts the tasks and the linked files of an entry's text. `isNote` decides
 * which link targets (as written, relative to the entry) count as notes, e.g.
 * not the links to other entries (moved tasks, the daily links of a week).
 */
export function entrySummary(text: string, isNote: (target: string) => boolean = () => true): EntrySummary {
    let open = 0;
    let tasks = 0;
    for (const line of text.split(/\r?\n/)) {
        const m = CHECKBOX.exec(line);
        // an empty "- [ ]" is a template's placeholder, not a task
        if (!m || m[4].trim() === '' || m[3] === '>') { continue; }
        tasks++;
        if (m[3] === undefined) { open++; }
    }
    const files = new Set(linkTargets(text).filter(target => target !== '' && !NOT_A_FILE.test(target) && isNote(target)));
    return { open, tasks, notes: files.size };
}
