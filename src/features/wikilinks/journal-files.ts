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
import { dayWikiTarget, JournalPaths, JournalScopes, JournalSettings, noteTitle, parseWikiTarget, weekWikiTarget, WikiNote, wikiTargetMatchesNote } from 'journal-core';
import { filesBelow, filesOfTemplate, templateSegments } from '../../shared/fs/template-walk';
import { IFileSystem } from '../../shared/model/index';
import { entryTemplate, matchPathTemplate } from '../../shared/paths';

type Config = JournalSettings & JournalScopes & JournalPaths;

/** The journal's files as wiki links name them (#92). */
export interface JournalFiles {
    /** Daily entries of the default scope by day (`2026-10-20`); the current layout wins over earlier ones. */
    days: Map<string, string>;
    /** Weekly entries of the default scope by week (`2026-w43`). */
    weeks: Map<string, string>;
    /** Notes of every scope (journal files that are no daily or weekly entry), with title and scope. */
    notes: WikiNote[];
}

export type Resolved = { kind: 'found'; path: string } | { kind: 'ambiguous'; paths: string[] } | { kind: 'missing' };

/**
 * Collects the daily and weekly entries of every layout (current patterns,
 * journal.patternHistory, defaults; #309) and the notes of every scope. A
 * note's scope is the scope whose notes folder holds it (the deepest one), its
 * title the `${input}` part of the notes file pattern.
 */
export async function scanJournalFiles(fs: IFileSystem, config: Config): Promise<JournalFiles> {
    const days = new Map<string, string>();
    const weeks = new Map<string, string>();
    const base = config.getBasePath();
    for (const layout of config.getLayouts()) {
        const entries = entryTemplate(layout);
        for (const file of await filesOfTemplate(fs, entries, base, layout.ext)) {
            const m = matchPathTemplate(file, entries, base, layout.ext);
            if (m?.year === undefined || m.month === undefined || m.day === undefined) { continue; }
            const key = dayWikiTarget(new Date(m.year, m.month - 1, m.day));
            if (!days.has(key)) { days.set(key, file); }
        }
        const weekly = layout.patterns.weeks.path + '/' + layout.patterns.weeks.file;
        for (const file of await filesOfTemplate(fs, weekly, base, layout.ext)) {
            const m = matchPathTemplate(file, weekly, base, layout.ext);
            if (m?.week === undefined || m.year === undefined) { continue; }
            const key = weekWikiTarget(m.week, m.year);
            if (!weeks.has(key)) { weeks.set(key, file); }
        }
    }

    // the notes folders of every scope and layout, deepest first: a file belongs to the deepest folder holding it
    const folders: { folder: string; scope: string; filePattern: string }[] = [];
    const extensions = new Set<string>();
    for (const scope of config.getScopeList()) {
        const scopeId = scope.isDefault ? undefined : scope.name;
        for (const layout of config.getLayouts(scopeId)) {
            extensions.add(layout.ext);
            const { root } = templateSegments(layout.patterns.notes.path + '/' + layout.patterns.notes.file, config.getBasePath(scopeId));
            folders.push({ folder: Path.normalize(root), scope: scope.name, filePattern: layout.patterns.notes.file });
        }
    }
    folders.sort((a, b) => b.folder.length - a.folder.length);
    const entryFiles = new Set([...days.values(), ...weeks.values()].map(file => Path.normalize(file)));
    const notes: WikiNote[] = [];
    for (const file of await filesBelow(fs, folders.map(f => f.folder), [...extensions])) {
        if (entryFiles.has(Path.normalize(file))) { continue; }
        const owner = folders.find(f => Path.normalize(file).startsWith(f.folder + Path.sep));
        if (!owner) { continue; }
        notes.push({ path: file, title: noteTitle(file, owner.filePattern), scope: owner.scope });
    }
    return { days, weeks, notes };
}

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
