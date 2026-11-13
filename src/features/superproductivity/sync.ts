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

import moment = require('moment');
import { CHECKBOX, DONE_ANNOTATION, DONE_TIME_FORMAT, doneSuffix, keyName, subtaskLines, TASK_BOX } from 'journal-core';
import { SuperProductivityTask } from './client';
import { TaskMapping } from './mapping';

type ScopeName = (name: string) => string | undefined;

/** A task of the journal linked to Super Productivity: its line, key, task id and whether it is done. */
export interface LinkedTask {
    line: number;
    key: string;
    id: string;
    isDone: boolean;
}

/** What a sync changes: lines of the journal and tasks in Super Productivity. */
export interface SyncPlan {
    /** Lines of the journal with their new text. */
    edits: { line: number; text: string }[];
    /** Ids of the tasks to complete in Super Productivity. */
    complete: string[];
    /** Tasks to plan for a later day in Super Productivity: the day of their latest line in the journal. */
    reschedule: { id: string; day: string }[];
    completedInJournal: number;
    reopenedInJournal: number;
    /** Linked tasks that do not exist in Super Productivity (any more). */
    missing: number;
}

/** "(done: …)" and the link to the day a plan item gets with it. */
const DONE = new RegExp(DONE_ANNOTATION.source + /(?:\s*\[\[\d{4}-\d{2}-\d{2}\]\])?/.source);

/**
 * The tasks of the page whose key is linked to a task in Super Productivity
 * (docs/specs/2026-11-13-scopes-keys-plans.md); moved tasks (`[>]`) are left
 * to their copy, a plan item in progress (`[/]`) is not done.
 */
export function linkedTasks(lines: readonly string[], mapping: Pick<TaskMapping, 'get'>, scopeName: ScopeName): LinkedTask[] {
    return lines.flatMap((text, line) => {
        const box = CHECKBOX.exec(text);
        const key = box && box[3] !== '>' ? keyName(text, scopeName) : undefined;
        const id = key ? mapping.get(key) : undefined;
        return key && id ? [{ line, key, id, isDone: box![3] === 'x' || box![3] === 'X' }] : [];
    });
}

/**
 * Compares the linked tasks with their state in Super Productivity (`tasks`
 * by id; not there: not found there):
 * - completed there: completed in the journal, with the time of its completion
 * - completed in the journal, open there: the more recent change wins. Changed
 *   there after the "(done: …)" time: reopened in the journal; else, and
 *   without the annotation, completed there.
 * - open on both sides: planned there for the latest day of the key in the
 *   journal (`plannedDay`), never for an earlier one than it is planned for
 */
export function planSync(lines: readonly string[], tasks: ReadonlyMap<string, SuperProductivityTask | undefined>, mapping: Pick<TaskMapping, 'get'>, scopeName: ScopeName, plannedDay: ReadonlyMap<string, string> = new Map()): SyncPlan {
    const plan: SyncPlan = { edits: [], complete: [], reschedule: [], completedInJournal: 0, reopenedInJournal: 0, missing: 0 };
    for (const { line, key, id, isDone } of linkedTasks(lines, mapping, scopeName)) {
        const task = tasks.get(id);
        const text = lines[line];
        if (!task) {
            plan.missing++;
        } else if (!isDone && task.isDone) {
            const time = moment(task.doneOn ?? undefined).format(DONE_TIME_FORMAT);
            plan.edits.push({ line, text: text.replace(/\[\s{0,2}\/?\s{0,2}\]/, TASK_BOX.done) + doneSuffix(time) });
            plan.completedInJournal++;
        } else if (isDone && !task.isDone && changedAfterCompletion(task, text)) {
            plan.edits.push({ line, text: text.replace(/\[\s{0,2}[xX]\s{0,2}\]/, TASK_BOX.open).replace(DONE, '') });
            plan.reopenedInJournal++;
        } else if (isDone && !task.isDone) {
            plan.complete.push(id);
        } else if (!isDone && !task.isDone) {
            const day = plannedDay.get(key);
            if (day && (task.dueDay ?? '') < day && !plan.reschedule.some(r => r.id === id)) { plan.reschedule.push({ id, day }); }
        }
    }
    return plan;
}

/** Whether the task was changed in Super Productivity after the "(done: …)" time of the line; false without that time. */
export function changedAfterCompletion(task: SuperProductivityTask, line: string): boolean {
    const done = moment(/\(done: ([^)]*)\)/.exec(line)?.[1] ?? '', DONE_TIME_FORMAT, true);
    return task.modified !== undefined && done.isValid() && task.modified > done.valueOf();
}

/**
 * The open tasks of the page that are not linked yet. In a plan (`leavesOnly`)
 * only the items without sub-items: those are what is worked on.
 */
export function tasksToSend(lines: readonly string[], mapping: Pick<TaskMapping, 'get'>, scopeName: ScopeName, leavesOnly: boolean): number[] {
    return lines.flatMap((text, line) => {
        const box = CHECKBOX.exec(text);
        if (!box || !box[4].trim() || (box[3] !== undefined && box[3] !== '/')) { return []; }
        const key = keyName(text, scopeName);
        if (key && mapping.get(key)) { return []; }
        if (leavesOnly && subtaskLines(lines, line).some(i => CHECKBOX.test(lines[i]))) { return []; }
        return [line];
    });
}

/**
 * The tasks of Super Productivity that belong in the daily entry of `day` but
 * are linked nowhere in the journal: planned for that day, and for today also
 * the open ones planned for an earlier day. Sub-tasks stay in Super
 * Productivity.
 */
export function tasksToImport(tasks: readonly SuperProductivityTask[], day: string, today: string, linked: ReadonlySet<string>): SuperProductivityTask[] {
    return tasks.filter(task => !task.parentId && !linked.has(task.id) && !!task.dueDay
        && (task.dueDay === day || (day === today && !task.isDone && task.dueDay < today)));
}

/**
 * The text of a task line for Super Productivity: without the checkbox and
 * the fixed parts of the task template (`template`, e.g.
 * "- [] ${d:LL} - Task: ${input}").
 */
export function taskText(line: string, template: string): string {
    const text = (CHECKBOX.exec(line)?.[4] ?? line).trim();
    const [before, after] = (CHECKBOX.exec(template)?.[4] ?? template).split('${input}');
    if (after === undefined) { return text; }
    // variables of the template (dates) match any text
    const pattern = (part: string) => part.trim().split(/\$\{[^}]*\}/).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*?');
    const match = new RegExp(`^${pattern(before)}\\s*(.*?)\\s*${pattern(after)}$`).exec(text);
    return match?.[1] || text;
}

/** The link of the 1.2.2-sp betas: `<!-- sp:AbC123 -->` at the end of a task. */
const BETA_LINK = /\s?<!--\s*sp:([\w-]+)\s*-->/;

/** The lines with a link of the betas, and their task id; converted to keys on the first sync (decision 24). */
export function betaLinks(lines: readonly string[]): { line: number; id: string }[] {
    return lines.flatMap((text, line) => {
        const id = BETA_LINK.exec(text)?.[1];
        return id !== undefined && CHECKBOX.test(text) ? [{ line, id }] : [];
    });
}

/** The text without the link of the betas. */
export function withoutBetaLink(text: string): string {
    return text.replace(BETA_LINK, '');
}
