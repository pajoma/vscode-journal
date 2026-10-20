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
import { JournalPaths, JournalScopes, JournalSettings, Layout, replaceLinkTargets } from 'journal-core';
import { fileExists } from '../../shared/fs/fs-exists';
import { filesBelow, filesOfTemplate, templateSegments } from '../../shared/fs/template-walk';
import { IFileSystem } from '../../shared/model/index';
import { entryTemplate, matchPathTemplate, matchTemplateInput, notesTemplate, validDate, weekTemplate } from '../../shared/paths';

type Config = JournalSettings & JournalScopes & JournalPaths;

/** What a file of an earlier layout is. */
export type MoveKind = 'entry' | 'weekly' | 'note';

/** A file of an earlier layout and where the current layout puts it (#309). */
export interface Move {
    kind: MoveKind;
    from: string;
    to: string;
    scope: string;
    /** The earlier layout the file is in. */
    layout: Layout;
}

/** A file that is not moved: the target exists, or another file of the plan goes there. */
export interface Conflict extends Move {
    reason: 'exists' | 'duplicate';
}

export interface MigrationPlan {
    moves: Move[];
    conflicts: Conflict[];
}

/** The links of one journal file that change when the files move (#309). */
export interface LinkChange {
    /** The file where it is now. */
    file: string;
    /** Where it is after the migration: its target if it is moved, else the same. */
    target: string;
    /** Each changed link: the target as written before and after. */
    links: { from: string; to: string }[];
}

export interface MigrationResult {
    moved: Move[];
    failed: { move: Move; error: unknown }[];
    /** The links that were changed; the same as {@link planLinkChanges} returned for these moves if all succeeded. */
    linkChanges: LinkChange[];
}

/** A file of an earlier layout, to find its place in the current layout. */
interface Found {
    config: Config;
    scopeId: string | undefined;
    file: string;
    /** The template of the earlier layout the file matches. */
    template: string;
    base: string;
    ext: string;
}

/**
 * The kinds of files a migration moves: which template of a layout finds
 * them, and where the current layout puts a file it found (undefined: the
 * file names no day or week, it is not moved). A new kind is one more row.
 */
const KINDS: { kind: MoveKind; template: (layout: Layout) => string; target: (found: Found) => string | undefined }[] = [
    {
        kind: 'entry',
        template: entryTemplate,
        target: ({ config, scopeId, file, template, base, ext }) => {
            const m = matchPathTemplate(file, template, base, ext);
            const date = m && validDate(m.year, m.month, m.day);
            return date ? config.getEntryPaths(date, scopeId)[0] : undefined;
        },
    },
    {
        kind: 'weekly',
        template: weekTemplate,
        target: ({ config, scopeId, file, template, base, ext }) => {
            const m = matchPathTemplate(file, template, base, ext);
            return m?.week !== undefined && m.year !== undefined ? config.getWeekPaths(m.week, m.year, scopeId)[0] : undefined;
        },
    },
    {
        kind: 'note',
        template: notesTemplate,
        target: ({ config, scopeId, file, template, base, ext }) => {
            const m = matchPathTemplate(file, template, base, ext);
            const date = m && validDate(m.year, m.month, m.day);
            const title = matchTemplateInput(file, template, base, ext);
            return date && title !== undefined
                ? Path.join(config.getResolvedNotesPath(date, scopeId).value, config.getNotesFilePattern(date, title, scopeId).value)
                : undefined;
        },
    },
];

/**
 * The files of the earlier layouts (`journal.patternHistory` and the default
 * patterns) and where the current layout puts them: daily entries by their
 * day, weekly entries by their week, notes by their day and title. Never
 * overwrites: a target that exists, or that another file goes to, is a
 * conflict. A file that lies where the current layout of a scope puts its
 * own files (see {@link currentTemplates}) is not moved.
 */
export async function planMigration(fs: IFileSystem, config: Config): Promise<MigrationPlan> {
    const current = currentTemplates(config);
    const isCurrent = (file: string) => current.some(([template, base, ext]) => matchPathTemplate(file, template, base, ext) !== undefined);

    const found: Move[] = [];
    const seen = new Set<string>();
    for (const scope of config.getScopeList()) {
        const scopeId = scope.isDefault ? undefined : scope.name;
        const base = config.getBasePath(scopeId);
        for (const layout of config.getLayouts(scopeId).filter(l => !l.current)) {
            for (const kind of KINDS) {
                const template = kind.template(layout);
                for (const file of await filesOfTemplate(fs, template, base, layout.ext)) {
                    const to = kind.target({ config, scopeId, file, template, base, ext: layout.ext });
                    if (!to || seen.has(file) || Path.normalize(file) === Path.normalize(to) || isCurrent(file)) { continue; }
                    seen.add(file);
                    found.push({ kind: kind.kind, from: file, to: Path.normalize(to), scope: scope.name, layout });
                }
            }
        }
    }

    const moves: Move[] = [];
    const conflicts: Conflict[] = [];
    const targets = new Set<string>();
    for (const move of found) {
        if (targets.has(move.to)) {
            conflicts.push({ ...move, reason: 'duplicate' });
        } else if (await fileExists(fs, move.to)) {
            conflicts.push({ ...move, reason: 'exists' });
        } else {
            targets.add(move.to);
            moves.push(move);
        }
    }
    return { moves, conflicts };
}

/**
 * The dry run of the link updates: every journal file whose links change when
 * the files move, and how. Writes nothing; {@link migrate} computes the
 * changes the same way, so the preview shows what is written.
 */
export async function planLinkChanges(fs: IFileSystem, config: Config, moves: Move[]): Promise<LinkChange[]> {
    return linkChanges(await readJournal(fs, config), moves).map(withoutText);
}

/**
 * Moves the files and updates the relative links in every journal file:
 * links to a moved file, and the links of a moved file to the files around
 * it. A file that cannot be moved stays where it is, the others are moved,
 * and the links follow only the files that moved. Folders left empty are
 * removed (not the base).
 */
export async function migrate(fs: IFileSystem, config: Config, moves: Move[]): Promise<MigrationResult> {
    const journal = await readJournal(fs, config);

    const moved: Move[] = [];
    const failed: { move: Move; error: unknown }[] = [];
    for (const move of moves) {
        try {
            await fs.createDirectory(Path.dirname(move.to));
            await fs.rename(move.from, move.to);
            moved.push(move);
        } catch (error) {
            failed.push({ move, error });
        }
    }

    const changes = linkChanges(journal, moved);
    for (const change of changes) {
        await fs.writeFile(change.target, new TextEncoder().encode(change.text));
    }

    for (const move of moved) {
        await removeEmptyFolders(fs, Path.dirname(move.from), config.getBasePath(move.scope));
    }
    return { moved, failed, linkChanges: changes.map(withoutText) };
}

function withoutText({ file, target, links }: LinkChange): LinkChange {
    return { file, target, links };
}

/** The text of every journal file, by its path before the migration. */
async function readJournal(fs: IFileSystem, config: Config): Promise<Map<string, string>> {
    const texts = new Map<string, string>();
    for (const file of await filesBelow(fs, journalFolders(config), extensions(config))) {
        try {
            texts.set(Path.normalize(file), new TextDecoder().decode(await fs.readFile(file)));
        } catch {
            // an unreadable file keeps its links
        }
    }
    return texts;
}

/** The files whose links change when these files move, with their new text. */
function linkChanges(journal: Map<string, string>, moves: Move[]): (LinkChange & { text: string })[] {
    const map = new Map(moves.map(move => [Path.normalize(move.from), move.to]));
    const changes: (LinkChange & { text: string })[] = [];
    for (const [file, text] of journal) {
        const target = map.get(file) ?? file;
        const links: { from: string; to: string }[] = [];
        const updated = replaceLinkTargets(text, link => {
            const next = movedLink(link, Path.dirname(file), Path.dirname(target), map);
            if (next !== undefined && next !== link) { links.push({ from: link, to: next }); }
            return next;
        });
        if (updated !== text) { changes.push({ file, target, links, text: updated }); }
    }
    return changes;
}

/** The new target of a link in a file that was in `from` and is now in `to`; undefined if it stays. */
export function movedLink(target: string, from: string, to: string, moved: Map<string, string>): string | undefined {
    if (target === '' || target.startsWith('#') || /^[a-z][a-z0-9+.-]+:/i.test(target)) { return undefined; }
    const hash = target.indexOf('#');
    const [file, anchor] = hash < 0 ? [target, ''] : [target.slice(0, hash), target.slice(hash)];
    if (Path.isAbsolute(file)) {
        const next = moved.get(Path.normalize(file));
        return next ? next.split(Path.sep).join('/') + anchor : undefined;
    }
    const absolute = Path.resolve(from, file);
    const next = moved.get(absolute) ?? absolute;
    if (next === absolute && from === to) { return undefined; }
    return Path.relative(to, next).split(Path.sep).join('/') + anchor;
}

/**
 * The templates of the current layout of every scope, with the scope's base
 * and extension: where the scopes put their own files now. A scope only owns
 * the files of a kind if it has its own base, sets the pattern for that kind
 * itself or (notes) is a folder scope; a scope that falls back to the default
 * patterns in the journal base would otherwise claim every file of the
 * default layout, and the old daily entries would never move.
 */
function currentTemplates(config: Config): [string, string, string][] {
    return config.getScopeList().flatMap(scope => {
        const scopeId = scope.isDefault ? undefined : scope.name;
        const [layout] = config.getLayouts(scopeId);
        const base = config.getBasePath(scopeId);
        const owns = (kind: 'entries' | 'weeks' | 'notes') => scope.isDefault || scope.base !== undefined
            || scope.pattern(kind, 'path') !== undefined || scope.pattern(kind, 'file') !== undefined
            || (kind === 'weeks' && scope.pattern('entries', 'path') !== undefined)
            || (kind === 'notes' && scope.notesFolder !== undefined);
        const templates: string[] = [];
        if (owns('entries')) { templates.push(entryTemplate(layout)); }
        if (owns('weeks')) { templates.push(weekTemplate(layout)); }
        if (owns('notes')) { templates.push(notesTemplate(layout)); }
        return templates.map(template => [template, base, layout.ext] as [string, string, string]);
    });
}

/** The folders that hold journal files: the bases, the scope root and where every layout starts. */
function journalFolders(config: Config): string[] {
    const folders = [config.getScopeRoot()];
    for (const scope of config.getScopeList()) {
        const scopeId = scope.isDefault ? undefined : scope.name;
        const base = config.getBasePath(scopeId);
        folders.push(base);
        for (const layout of config.getLayouts(scopeId)) {
            for (const template of [entryTemplate(layout), weekTemplate(layout), notesTemplate(layout)]) {
                folders.push(templateSegments(template, base).root);
            }
        }
    }
    return folders.filter(folder => folder.length > 0);
}

function extensions(config: Config): string[] {
    return [...new Set(config.getScopeList().flatMap(scope => config.getLayouts(scope.isDefault ? undefined : scope.name).map(l => l.ext)))];
}

/** Removes the folder and its parents while they are empty, up to (not including) the base. */
async function removeEmptyFolders(fs: IFileSystem, folder: string, base: string): Promise<void> {
    const root = Path.normalize(base);
    for (let dir = Path.normalize(folder); dir.startsWith(root + Path.sep); dir = Path.dirname(dir)) {
        try {
            if ((await fs.readDirectory(dir)).length > 0) { return; }
            await fs.delete(dir);
        } catch {
            return;
        }
    }
}
