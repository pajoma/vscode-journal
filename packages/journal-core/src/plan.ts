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
 * The plan of a scope and its execution in the journal
 * (docs/specs/2026-11-13-scopes-keys-plans.md, decisions 12-18): the plan is
 * every task with a key in the files of the scope folder; the executions are
 * the lines with that key in the daily and weekly entries. The plan follows
 * the latest execution: in progress while it is open, done when it is done.
 * The extension and the MCP server both apply it.
 */

import { itemNumber, numberedCopies, numberedId, PlanRef } from './outline';
import { formatKey, keyOf } from './refs';
import { CHECKBOX, DONE_ANNOTATION, subtaskLines, TASK_BOX } from './tasks';

export type TaskState = 'open' | 'progress' | 'done' | 'moved';

/** A task with a key: its line, its key as written by {@link formatKey} (lower case) and its state. */
export interface KeyedTask {
    line: number;
    key: string;
    state: TaskState;
}

/** Where the work on a key stands: the day of its latest line in the entries, done or not, and when it was done. */
export interface Execution {
    day: string;
    done: boolean;
    /** The time of `(done: …)`, if the line has one. */
    time?: string;
}

/** The state of a checkbox mark. */
export function taskState(mark: string | undefined): TaskState {
    switch (mark) {
        case 'x': case 'X': return 'done';
        case '>': return 'moved';
        case '/': return 'progress';
        default: return 'open';
    }
}

/** The key of a task as one string, lower case: `#acme:12`, `:7`. */
export function keyName(line: string, scopeName: (name: string) => string | undefined): string | undefined {
    const key = keyOf(line, scopeName);
    return key ? formatKey({ scope: key.scope?.toLowerCase(), number: key.number }).toLowerCase() : undefined;
}

/** The tasks with a key of a page. */
export function keyedTasks(lines: readonly string[], scopeName: (name: string) => string | undefined): KeyedTask[] {
    return lines.flatMap((text, line) => {
        const box = CHECKBOX.exec(text);
        const key = box ? keyName(text, scopeName) : undefined;
        return box && key ? [{ line, key, state: taskState(box[3]) }] : [];
    });
}

/**
 * The plan items an entry's tasks are copies of: by key (`#acme:12`), and by
 * scope, plan and outline number (`acme/plan#1.1`, see {@link numberedCopies}).
 */
export function copiedItems(lines: readonly string[], scopeName: (name: string) => string | undefined): { line: number; id: string; state: TaskState }[] {
    const keyed = keyedTasks(lines, scopeName).map(({ line, key, state }) => ({ line, id: key, state }));
    const numbered = numberedCopies(lines, scopeName).map(({ line, id }) => ({ line, id, state: taskState(CHECKBOX.exec(lines[line])![3]) }));
    return [...keyed, ...numbered].sort((a, b) => a.line - b.line);
}

/**
 * Where the work on each plan item stands in the entries (`day`:
 * `YYYY-MM-DD`; a weekly entry counts with the first day of its week): the
 * latest day with a copy of it (by key or number, see {@link copiedItems})
 * that was not moved on. Done if a copy of that day is done.
 */
export function executions(entries: readonly { day: string; lines: readonly string[] }[], scopeName: (name: string) => string | undefined): Map<string, Execution> {
    const result = new Map<string, Execution>();
    for (const { day, lines } of [...entries].sort((a, b) => a.day.localeCompare(b.day))) {
        for (const task of copiedItems(lines, scopeName)) {
            if (task.state === 'moved') { continue; }
            const done = task.state === 'done';
            const before = result.get(task.id);
            if (before?.day === day && before.done && !done) { continue; }
            const time = done ? /\(done: ([^)]*)\)/.exec(lines[task.line])?.[1] : undefined;
            result.set(task.id, { day, done, ...(time ? { time } : {}) });
        }
    }
    return result;
}

/** The items of a plan with the ids their copies have: the key, and with `plan` the outline number (`acme/plan#1.1`). */
function planItems(lines: readonly string[], scopeName: (name: string) => string | undefined, plan?: PlanRef): { line: number; ids: string[]; state: TaskState }[] {
    return lines.flatMap((text, line) => {
        const box = CHECKBOX.exec(text);
        if (!box) { return []; }
        const key = keyName(text, scopeName);
        const number = plan ? itemNumber(text) : undefined;
        const ids = [...(key ? [key] : []), ...(plan && number ? [numberedId(plan, number.number)] : [])];
        return ids.length ? [{ line, ids, state: taskState(box[3]) }] : [];
    });
}

/** " (done: <time>) [[<day>]]", appended to a plan item done in the journal. */
export function planDoneSuffix(execution: Execution): string {
    return ` (done: ${execution.time ?? execution.day}) [[${execution.day}]]`;
}

/** "(done: …)" and the link to the day after it. */
const PLAN_DONE = new RegExp(DONE_ANNOTATION.source + /(?:\s*\[\[\d{4}-\d{2}-\d{2}\]\])?/.source);

/** The text without "(done: …)" and the link to the day a plan item gets with it. */
export function withoutPlanDone(text: string): string {
    return text.replace(PLAN_DONE, '');
}

/** "(done: …) [[day]]": done in the journal, as written by {@link planDoneSuffix}. */
const DONE_IN_JOURNAL = new RegExp(DONE_ANNOTATION.source + /\s*\[\[\d{4}-\d{2}-\d{2}\]\]/.source);

/**
 * The lines of a plan to change so that they follow their executions:
 * - executed and open: in progress (`[/]`), also a plan item done in the journal before (reopened there)
 * - executed and done: done, with the time and a link to the day
 * Only the items whose ids are in `only` (all if omitted), e.g. those of the
 * entry that changed. With `plan`, numbered items follow their numbered copies
 * (decision 26), else only items with a key do. Plan items without
 * execution, moved ones, those already in that state and those completed in
 * the plan directly (no link to a day) stay (decision 16).
 */
export function planEdits(lines: readonly string[], executed: ReadonlyMap<string, Execution>, scopeName: (name: string) => string | undefined, only?: ReadonlySet<string>, plan?: PlanRef): { line: number; text: string }[] {
    return planItems(lines, scopeName, plan).flatMap(({ line, ids, state }) => {
        const id = ids.find(candidate => executed.has(candidate) && (!only || only.has(candidate)));
        const execution = id === undefined ? undefined : executed.get(id);
        if (!execution || state === 'moved') { return []; }
        const text = lines[line];
        if (execution.done && state !== 'done') {
            return [{ line, text: text.replace(/\[\s{0,2}\/?\s{0,2}\]/, TASK_BOX.done).replace(PLAN_DONE, '') + planDoneSuffix(execution) }];
        }
        if (!execution.done && state !== 'progress' && (state !== 'done' || DONE_IN_JOURNAL.test(text))) {
            return [{ line, text: text.replace(/\[\s{0,2}[xX]?\s{0,2}\]/, TASK_BOX.progress).replace(PLAN_DONE, '') }];
        }
        return [];
    });
}

/** How far the sub-tasks of the task at `index` are: done and all, at any depth; moved ones do not count. */
export function progress(lines: readonly string[], index: number): { done: number; total: number } {
    let done = 0;
    let total = 0;
    for (const i of subtaskLines(lines, index)) {
        const box = CHECKBOX.exec(lines[i]);
        if (!box || !box[4].trim()) { continue; }
        const state = taskState(box[3]);
        if (state === 'moved') { continue; }
        total++;
        if (state === 'done') { done++; }
    }
    return { done, total };
}
