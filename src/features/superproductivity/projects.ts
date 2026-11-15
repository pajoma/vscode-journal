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

import { CHECKBOX, formatKey, headings, keyOf, scopeOf, TaskKey } from 'journal-core';
import { NewTask, SuperProductivityProject, SuperProductivityTask } from './client';
import { TaskMapping } from './mapping';
import { linkedTasks } from './sync';

type ScopeName = (name: string) => string | undefined;

/** The inbox of Super Productivity: tasks without a project of their own. */
export const INBOX_PROJECT = 'INBOX_PROJECT';

/**
 * Which project of Super Productivity a scope stands for
 * (docs/specs/2026-11-13-scopes-keys-plans.md, decision 20): the entry of the
 * scope in `journal.superProductivity.projects` (slug → title or id), else the
 * project with the slug as title, case ignored.
 */
export class ProjectMap {
    private readonly byScope = new Map<string, SuperProductivityProject>();

    constructor(projects: readonly SuperProductivityProject[], mapping: Readonly<Record<string, string>> = {}) {
        for (const project of projects) {
            if (project.id !== INBOX_PROJECT) { this.byScope.set(project.title.toLowerCase(), project); }
        }
        for (const [scope, target] of Object.entries(mapping)) {
            const project = projects.find(p => p.id === target) ?? projects.find(p => p.title.toLowerCase() === target.toLowerCase());
            if (project) { this.byScope.set(scope.replace(/^#/, '').toLowerCase(), project); }
        }
    }

    /** The project of the scope; undefined if none. */
    public project(scope: string | undefined): SuperProductivityProject | undefined {
        return scope === undefined ? undefined : this.byScope.get(scope.toLowerCase());
    }

    /** The scope a project stands for (of `scopes`, as named there), for tasks imported from it; undefined for the inbox and others. */
    public scope(projectId: string | null | undefined, scopes: readonly string[]): string | undefined {
        return scopes.find(scope => this.project(scope)?.id === projectId && projectId !== undefined);
    }
}

/**
 * The scope of the task at `index`: the first scope its line names (tag or
 * key), else the scope of its parent task (the task above with less indent),
 * else that of `pageScope` (a file of a scope folder, e.g. its plan).
 */
export function taskScope(lines: readonly string[], index: number, scopeName: ScopeName, pageScope?: string): string | undefined {
    for (let i = index, indent = Infinity; i >= 0; i--) {
        const box = CHECKBOX.exec(lines[i]);
        if (!box || box[1].length >= indent) { continue; }
        const scope = scopeOf(box[4], scopeName);
        if (scope !== undefined) { return scope; }
        indent = box[1].length;
        if (indent === 0) { break; }
    }
    return pageScope;
}

/**
 * Where a task of a plan stands in it, for its description in Super
 * Productivity: the scope, the headings above it and its parent tasks,
 * `acme › Phase 1: Discovery › interviews`.
 */
export function breadcrumb(lines: readonly string[], index: number, scope: string, scopeName: ScopeName): string {
    const parts: string[] = [];
    for (let i = index - 1, indent = CHECKBOX.exec(lines[index])?.[1].length ?? 0; i >= 0 && indent > 0; i--) {
        const box = CHECKBOX.exec(lines[i]);
        if (!box || box[1].length >= indent) { continue; }
        parts.unshift(withoutKey(box[4], scopeName));
        indent = box[1].length;
    }
    const levels: string[] = [];
    for (const heading of headings([...lines.slice(0, index)])) {
        levels.splice(heading.level - 1);
        levels[heading.level - 1] = heading.text;
    }
    return [scope, ...levels.filter(level => level !== undefined), ...parts].join(' › ');
}

/** The text without its key. */
function withoutKey(text: string, scopeName: ScopeName): string {
    const key = keyOf(text, scopeName);
    return key ? text.replace(formatKeyPattern(key), ' ').replace(/\s{2,}/g, ' ').trim() : text.trim();
}

const formatKeyPattern = (key: TaskKey) => new RegExp(`(^|\\s)${key.scope ? `#${key.scope}` : ''}:${key.number}(?=\\s|$)`, 'i');

/**
 * The task to create in Super Productivity for a task of the journal with its
 * key and text (decision 21): the title starts with the key; the project is
 * that of its scope; planned for the day of a daily entry, not planned from
 * weekly entries and plans; a task of a plan has its place in the plan as
 * description.
 */
export function newTask(lines: readonly string[], index: number, key: TaskKey, text: string, page: { day?: string; scope?: string; file?: string }, projects: ProjectMap, scopeName: ScopeName): { title: string; where: NewTask } {
    const scope = taskScope(lines, index, scopeName, page.scope);
    const project = projects.project(scope);
    const notes = page.scope && page.file ? `${breadcrumb(lines, index, page.scope, scopeName)}\n\n${page.file}` : undefined;
    return {
        title: `${formatKey(key)} ${withoutKey(text, scopeName)}`.trim(),
        where: { dueDay: page.day ?? null, ...(project ? { projectId: project.id } : {}), ...(notes ? { notes } : {}) },
    };
}

/**
 * The open linked tasks that are still in the inbox of Super Productivity but
 * belong to a project by their scope (e.g. the scope was created after
 * sending). Tasks already in a project stay where they are: they may have
 * been moved there on purpose.
 */
export function projectMoves(lines: readonly string[], tasks: ReadonlyMap<string, SuperProductivityTask | undefined>, mapping: Pick<TaskMapping, 'get'>, projects: ProjectMap, scopeName: ScopeName, pageScope?: string): { id: string; projectId: string }[] {
    return linkedTasks(lines, mapping, scopeName).flatMap(({ line, id, isDone }) => {
        const task = tasks.get(id);
        if (isDone || !task || task.parentId || (task.projectId && task.projectId !== INBOX_PROJECT)) { return []; }
        const target = projects.project(taskScope(lines, line, scopeName, pageScope));
        return target ? [{ id, projectId: target.id }] : [];
    });
}
