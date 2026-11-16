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

import * as vscode from 'vscode';
import * as Path from 'path';
import { dayWikiTarget, firstDayOfWeek, isScopeReport, SCOPE_DEFAULT } from 'journal-core';
import { IConfiguration } from '../model/index';
import { JournalIndex } from './journal-index';
import { isInside, pathKey } from '../paths';

/** Moves a plan item into a day: `(uri: vscode.Uri, line: number, target: number)`, target as the copy-task command takes it. */
export const PULL_PLAN_ITEM = 'journal.commands.pull-plan-item';
/**
 * Announces tasks with keys that a code action completed, reopened or
 * planned for a day: `(uri: vscode.Uri, keys: string[], change)`, fires
 * `TasksChangedEvent`; plans and Super Productivity follow.
 */
export const TASKS_CHANGED = 'journal.commands.tasks-changed';
/** Opens the plan item of a key: `(key: string)`, e.g. `#acme:12`. */
export const OPEN_PLAN_ITEM = 'journal.commands.open-plan-item';

/**
 * The scope whose folder holds the file: its plan (docs/specs/2026-11-13-scopes-keys-plans.md);
 * undefined for other files and for the report of the scope.
 */
export function scopeOfPage(config: Pick<IConfiguration, 'getScopeList'>, path: string): string | undefined {
    if (isScopeReport(path)) { return undefined; }
    return config.getScopeList().find(scope => !scope.isDefault && scope.notesFolder
        && isInside(path, scope.notesFolder))?.name;
}

/** The wiki link target of a plan file, as the journal names it (and its copies link it): its title, with folders if not unique. */
export async function planTarget(index: JournalIndex, path: string): Promise<string> {
    const files = await index.get();
    return [...files.targets].find(([file]) => pathKey(file) === pathKey(path))?.[1] ?? Path.parse(path).name.replace(/_/g, ' ');
}

/** A page of the journal with its lines: of an open document as in the editor, else as on disk. */
export interface PlanPage {
    path: string;
    lines: string[];
}

/** Reads pages of the journal: of an open document as in the editor, else as on disk (cached by the index). */
export function pageReader(index: JournalIndex): (path: string) => Promise<string | undefined> {
    const open = new Map(vscode.workspace.textDocuments.filter(doc => doc.uri.scheme === 'file').map(doc => [pathKey(doc.uri.fsPath), doc]));
    return async path => open.get(pathKey(path))?.getText() ?? (await index.texts.read(path))?.text;
}

/** Whether the file is a daily or weekly entry of the journal; from the index, nothing is read. */
export async function isEntry(index: JournalIndex, path: string): Promise<boolean> {
    const files = await index.get();
    const key = pathKey(path);
    return [...files.days.values(), ...files.weeks.values()].some(file => pathKey(file) === key);
}

/**
 * The entries (daily, and weekly with the first day of the week) and the
 * plan pages (the files of the scope folders) of the journal, read in
 * parallel; `entries: false` reads the plans only.
 */
export async function planPages(index: JournalIndex, config: Pick<IConfiguration, 'getLocale'>, { entries: withEntries = true } = {}): Promise<{ entries: (PlanPage & { day: string })[]; plans: (PlanPage & { scope: string })[] }> {
    const files = await index.get();
    const read = pageReader(index);
    const page = async <T extends object>(path: string, more: T) => {
        const text = await read(path);
        return text === undefined ? [] : [{ path, lines: text.split(/\r?\n/), ...more }];
    };
    const weeks = [...files.weeks].flatMap(([week, path]) => {
        const m = /^(\d{4})-w(\d+)$/.exec(week);
        return m ? [{ path, day: dayWikiTarget(firstDayOfWeek(Number(m[2]), Number(m[1]), config.getLocale())) }] : [];
    });
    const [entries, plans] = await Promise.all([
        withEntries ? Promise.all([...[...files.days].map(([day, path]) => ({ path, day })), ...weeks].map(({ path, day }) => page(path, { day }))) : [],
        Promise.all(files.notes.filter(note => note.scope !== SCOPE_DEFAULT && !isScopeReport(note.path)).map(note => page(note.path, { scope: note.scope }))),
    ]);
    return { entries: entries.flat(), plans: plans.flat() };
}
