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

import * as path from 'path';

/**
 * Wiki links (#92): `[[target]]` or `[[target|label]]`. A target is a day
 * (`2026-10-20`), a week (`2026-w43`) or a note: its title, optionally with
 * `#scope ` in front or folders in front (`2026/10/20/Minutes`) where the
 * title alone is not unique. Days and weeks are found by date through the
 * layouts, notes by title; this module only parses and compares (no I/O).
 */

/** A wiki link in a text. */
export interface WikiLink {
    /** What is between `[[` and `]]` (or `|`), trimmed. */
    target: string;
    label?: string;
    /** Position of `[[` in the text and the length up to and including `]]`. */
    index: number;
    length: number;
}

export type WikiTarget =
    | { kind: 'day'; year: number; month: number; day: number }
    | { kind: 'week'; week: number; year: number }
    | { kind: 'note'; title: string; scope?: string; folders: string[] };

/** A note as the host knows it: its file, its title and its scope. */
export interface WikiNote {
    path: string;
    title: string;
    scope: string;
}

const WIKI_LINK = /\[\[([^[\]\n|]+?)(?:\|([^[\]\n]*))?\]\]/g;

/** The wiki links in a text, in order. */
export function wikiLinks(text: string): WikiLink[] {
    return [...text.matchAll(WIKI_LINK)]
        .filter(m => m[1].trim() !== '')
        .map(m => {
            const link: WikiLink = { target: m[1].trim(), index: m.index!, length: m[0].length };
            if (m[2] !== undefined && m[2].trim() !== '') { link.label = m[2].trim(); }
            return link;
        });
}

/** What a target names; anything that is no day and no week is a note. */
export function parseWikiTarget(target: string): WikiTarget {
    const text = target.trim();
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (day) {
        const [year, month, date] = [+day[1], +day[2], +day[3]];
        const d = new Date(year, month - 1, date);
        if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === date) {
            return { kind: 'day', year, month, day: date };
        }
    }
    const week = /^(\d{4})-w(\d{1,2})$/i.exec(text);
    if (week && +week[2] >= 1 && +week[2] <= 53) {
        return { kind: 'week', year: +week[1], week: +week[2] };
    }
    const scoped = /^#([A-Za-z0-9_-]+)\s+(.+)$/.exec(text);
    const [scope, rest] = scoped ? [scoped[1], scoped[2]] : [undefined, text];
    const parts = rest.split('/').map(part => part.trim()).filter(part => part !== '');
    const note: WikiTarget = { kind: 'note', title: parts[parts.length - 1] ?? rest, folders: parts.slice(0, -1) };
    if (scope) { note.scope = scope; }
    return note;
}

/** The target of a day: `2026-10-20`. */
export function dayWikiTarget(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** The target of a week: `2026-w43` (the year the week belongs to). */
export function weekWikiTarget(week: number, year: number): string {
    return `${year}-w${String(week).padStart(2, '0')}`;
}

/**
 * The title of a note file: the `${input}` part of its notes file pattern
 * (e.g. `Konzept` of `2026-10-09_Konzept.md` with `${d:YYYY-MM-DD}_${input}.${ext}`),
 * else the file name without extension; `_` read as space.
 */
export function noteTitle(file: string, filePattern = '${input}.${ext}'): string {
    const name = path.basename(file);
    const source = filePattern.split(/(\$\{[^}]+\})/).map((part, i) => {
        if (i % 2 === 0) { return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
        return part === '${input}' ? '(?<input>.+?)' : '.*?';
    }).join('');
    const input = new RegExp('^' + source + '$').exec(name)?.groups?.input;
    return (input ?? path.parse(name).name).replace(/_/g, ' ').trim();
}

/** Titles compare without case, `_` and spaces alike. */
function titleKey(title: string): string {
    return title.replace(/[_\s]+/g, ' ').trim().toLowerCase();
}

/** Whether a note is what a note target names: its title, the target's folders in front of it, its scope if the target has one. */
export function wikiTargetMatchesNote(target: WikiTarget, note: WikiNote): boolean {
    if (target.kind !== 'note' || titleKey(target.title) !== titleKey(note.title)) { return false; }
    if (target.scope && target.scope.toLowerCase() !== note.scope.toLowerCase()) { return false; }
    const folders = path.dirname(note.path).split(/[\\/]/);
    return target.folders.every((folder, i) => folders[folders.length - target.folders.length + i] === folder);
}

/**
 * The target that names this note: its title, or with as many folders in
 * front as needed to tell it from the other notes with the same title.
 */
export function noteWikiTarget(note: WikiNote, notes: WikiNote[]): string {
    const same = notes.filter(other => other.path !== note.path && titleKey(other.title) === titleKey(note.title));
    const folders = path.dirname(note.path).split(/[\\/]/).filter(folder => folder !== '');
    for (let count = 0; count <= folders.length; count++) {
        const target = parseWikiTarget([...folders.slice(folders.length - count), note.title].join('/'));
        if (!same.some(other => wikiTargetMatchesNote(target, other))) {
            return [...folders.slice(folders.length - count), note.title].join('/');
        }
    }
    return note.path.split(/[\\/]/).join('/');
}
