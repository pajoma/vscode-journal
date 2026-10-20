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

import { dayWikiTarget, parseWikiTarget, weekWikiTarget, wikiTargetMatchesNote } from 'journal-core';
import { JournalFiles } from '../../shared/journal/journal-files';

export type Resolved = { kind: 'found'; path: string } | { kind: 'ambiguous'; paths: string[] } | { kind: 'missing' };

/** The file a wiki link target names; a note title can name several notes. */
export function resolveWikiTarget(target: string, files: JournalFiles): Resolved {
    const parsed = parseWikiTarget(target);
    if (parsed.kind === 'day' || parsed.kind === 'week') {
        const key = parsed.kind === 'day' ? dayWikiTarget(new Date(parsed.year, parsed.month - 1, parsed.day)) : weekWikiTarget(parsed.week, parsed.year);
        const found = (parsed.kind === 'day' ? files.days : files.weeks).get(key);
        return found ? { kind: 'found', path: found } : { kind: 'missing' };
    }
    const paths = files.notes.filter(note => wikiTargetMatchesNote(parsed, note)).map(note => note.path);
    return paths.length === 1 ? { kind: 'found', path: paths[0] } : paths.length > 1 ? { kind: 'ambiguous', paths } : { kind: 'missing' };
}
