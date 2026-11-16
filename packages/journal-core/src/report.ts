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

/**
 * The report of a scope (docs/specs/2026-11-13-scopes-keys-plans.md,
 * decision 19): its plan by heading with the state of each item, and its
 * tasks in the journal of the last days, by day. Generated, never saved; the
 * extension shows it as a read-only document, the MCP server returns it.
 */

import * as path from 'path';
import { linkTargets } from './links';
import { FENCE, HEADING, headings, isTask } from './placement';
import { progress, taskState } from './plan';
import { scopeOf } from './refs';
import { CHECKBOX } from './tasks';
import { parseWikiTarget, WikiNote, wikiLinks, wikiTargetMatchesNote } from './wikilinks';

/**
 * A report page of a scope as earlier builds wrote it into the folder of the
 * scope, `<scope>.report.<ext>`: no plan, no note of the user. The report now
 * lies in the journal's .vscode folder, which is not scanned.
 */
export function isScopeReport(path: string): boolean {
    return /\.report\.[^./\\]+$/i.test(path);
}

/** What a report is made of. `link` turns a file into a markdown link (a wiki link in the journal) showing its name. */
export interface ScopeReportInput {
    scope: string;
    /** The files of the scope folder, with a name to show. */
    plans: readonly { name: string; path: string; lines: readonly string[] }[];
    /** The daily and weekly entries (`day`: `YYYY-MM-DD`, a week its first day). */
    entries: readonly { day: string; path: string; lines: readonly string[] }[];
    /** The days of the journal part: from (inclusive) and to (inclusive). */
    from: string;
    to: string;
    scopeName: (name: string) => string | undefined;
    link: (path: string, name: string) => string;
    /** The notes of the scope folder, with the first day an entry links to them (see {@link firstLinkingDays}). */
    notes?: readonly { name: string; path: string; day?: string }[];
}

/**
 * The first day an entry links to each of the notes, by wiki link (to this
 * note only) or markdown link (relative to the entry): the day the note was
 * written, as notes are linked from the entry of their day. By path; notes
 * no entry links to have none.
 */
export function firstLinkingDays(notes: readonly WikiNote[], entries: readonly { day: string; path: string; lines: readonly string[] }[]): Map<string, string> {
    const byPath = new Map(notes.map(note => [path.normalize(note.path), note.path]));
    const first = new Map<string, string>();
    const linked = (note: string, day: string) => {
        const before = first.get(note);
        if (before === undefined || day < before) { first.set(note, day); }
    };
    for (const entry of entries) {
        const text = entry.lines.join('\n');
        for (const { target } of wikiLinks(text)) {
            const parsed = parseWikiTarget(target);
            const matching = notes.filter(note => wikiTargetMatchesNote(parsed, note));
            if (matching.length === 1) { linked(matching[0].path, entry.day); }
        }
        for (const target of linkTargets(text)) {
            if (target === '' || target.startsWith('#') || /^[a-z][a-z0-9+.-]+:/i.test(target)) { continue; }
            const note = byPath.get(path.normalize(path.resolve(path.dirname(entry.path), target.split('#')[0])));
            if (note !== undefined) { linked(note, entry.day); }
        }
    }
    return first;
}

/** The notes newest first (by their day), the ones without day last, by name. */
function notesList(notes: readonly { name: string; path: string; day?: string }[], link: (path: string, name: string) => string): string[] {
    if (notes.length === 0) { return ['*No notes in the folder of the scope.*']; }
    return [...notes]
        .sort((a, b) => (b.day ?? '').localeCompare(a.day ?? '') || a.name.localeCompare(b.name))
        .map(note => `- ${link(note.path, note.name)}${note.day ? ` (${note.day})` : ''}`);
}

/** The report as markdown. */
export function scopeReport(input: ScopeReportInput): string {
    const { scope, scopeName, link } = input;
    const counts = { open: 0, progress: 0, done: 0 };
    const plan: string[] = [];
    for (const page of [...input.plans].sort((a, b) => a.name.localeCompare(b.name))) {
        const lines = page.lines;
        // tasks outside of code blocks
        let fenced = false;
        const tasks = lines.flatMap((text, i) => {
            if (FENCE.test(text)) { fenced = !fenced; }
            return !fenced && isTask(text) ? [i] : [];
        });
        if (tasks.length === 0) { continue; }
        plan.push('', `### ${link(page.path, page.name)}`);
        const shown = new Set(tasks);
        // the headings with tasks in their section (up to the next heading of the same level or above), one level below the file's
        const all = headings([...lines]);
        all.forEach((heading, n) => {
            const end = all.slice(n + 1).find(next => next.level <= heading.level)?.index ?? lines.length;
            if (heading.level > 1 && tasks.some(i => i > heading.index && i < end)) { shown.add(heading.index); }
        });
        for (const i of [...shown].sort((a, b) => a - b)) {
            const text = lines[i];
            const heading = HEADING.exec(text);
            if (heading) {
                plan.push('', `${'#'.repeat(Math.min(6, heading[1].length + 2))} ${heading[2]}`, '');
                continue;
            }
            const state = taskState(CHECKBOX.exec(text)![3]);
            if (state === 'open') { counts.open++; }
            if (state === 'progress') { counts.progress++; }
            if (state === 'done') { counts.done++; }
            const { done, total } = progress(lines, i);
            plan.push(text.trimEnd() + (total ? ` *(${done}/${total})*` : ''));
        }
    }

    const journal: string[] = [];
    let doneInJournal = 0;
    const entries = input.entries.filter(e => e.day >= input.from && e.day <= input.to).sort((a, b) => b.day.localeCompare(a.day));
    for (const entry of entries) {
        const lines = entry.lines.filter(text => {
            const box = CHECKBOX.exec(text);
            return box && box[3] !== '>' && box[4].trim() && scopeOf(text, scopeName)?.toLowerCase() === scope.toLowerCase();
        });
        if (lines.length === 0) { continue; }
        doneInJournal += lines.filter(text => taskState(CHECKBOX.exec(text)![3]) === 'done').length;
        journal.push('', `### ${link(entry.path, entry.day)}`, '', ...lines.map(text => text.trim()));
    }

    return [
        `# #${scope}`,
        '',
        `Plan: ${counts.open} open, ${counts.progress} in progress, ${counts.done} done. Journal ${input.from} – ${input.to}: ${doneInJournal} done.`,
        '',
        '## Plan',
        ...(plan.length ? plan : ['', '*No tasks in the files of the scope.*']),
        ...(input.notes ? ['', '## Notes', '', ...notesList(input.notes, link)] : []),
        '',
        `## Journal`,
        ...(journal.length ? journal : ['', `*No tasks of #${scope} from ${input.from} to ${input.to}.*`]),
        '',
    ].join('\n');
}
