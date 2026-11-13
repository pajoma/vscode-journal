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

import { HEADING, headings } from './placement';
import { progress, taskState } from './plan';
import { scopeOf } from './refs';
import { CHECKBOX } from './tasks';

/** What a report is made of. `link` turns a file into a markdown link target. */
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
    link: (path: string) => string;
}

/** The report as markdown. */
export function scopeReport(input: ScopeReportInput): string {
    const { scope, scopeName, link } = input;
    const counts = { open: 0, progress: 0, done: 0 };
    const plan: string[] = [];
    for (const page of [...input.plans].sort((a, b) => a.name.localeCompare(b.name))) {
        const lines = page.lines;
        const tasks = lines.flatMap((text, i) => {
            const box = CHECKBOX.exec(text);
            return box && box[4].trim() ? [i] : [];
        });
        if (tasks.length === 0) { continue; }
        plan.push('', `### [${page.name}](${link(page.path)})`);
        const shown = new Set(tasks);
        // the headings above tasks, one level below the file's
        for (const heading of headings([...lines])) {
            if (heading.level > 1 && tasks.some(i => i > heading.index)) { shown.add(heading.index); }
        }
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
        journal.push('', `### [${entry.day}](${link(entry.path)})`, '', ...lines.map(text => text.trim()));
    }

    return [
        `# #${scope}`,
        '',
        `Plan: ${counts.open} open, ${counts.progress} in progress, ${counts.done} done. Journal ${input.from} – ${input.to}: ${doneInJournal} done.`,
        '',
        '## Plan',
        ...(plan.length ? plan : ['', '*No tasks in the files of the scope.*']),
        '',
        `## Journal`,
        ...(journal.length ? journal : ['', `*No tasks of #${scope} from ${input.from} to ${input.to}.*`]),
        '',
    ].join('\n');
}
