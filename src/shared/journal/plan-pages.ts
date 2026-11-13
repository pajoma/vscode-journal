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
import { dayWikiTarget, firstDayOfWeek, SCOPE_DEFAULT } from 'journal-core';
import { IConfiguration } from '../model/index';
import { JournalIndex } from './journal-index';

/** Moves a plan item into a day: `(uri: vscode.Uri, line: number, target: number)`, target as the copy-task command takes it. */
export const PULL_PLAN_ITEM = 'journal.commands.pull-plan-item';
/** Updates the plans after a change of the tasks of an entry: `(uri?: vscode.Uri)`. */
export const UPDATE_PLANS = 'journal.commands.update-plans';
/** Opens the plan item of a key: `(key: string)`, e.g. `#acme:12`. */
export const OPEN_PLAN_ITEM = 'journal.commands.open-plan-item';

/**
 * The scope whose folder holds the file: its plan (docs/specs/2026-11-13-scopes-keys-plans.md);
 * undefined for other files.
 */
export function scopeOfPage(config: Pick<IConfiguration, 'getScopeList'>, path: string): string | undefined {
    const file = Path.normalize(path);
    return config.getScopeList().find(scope => !scope.isDefault && scope.notesFolder
        && file.startsWith(Path.normalize(scope.notesFolder) + Path.sep))?.name;
}

/** A page of the journal with its lines: of an open document as in the editor, else as on disk. */
export interface PlanPage {
    path: string;
    lines: string[];
}

/**
 * The entries (daily, and weekly with the first day of the week) and the
 * plan pages (the files of the scope folders) of the journal.
 */
export async function planPages(index: JournalIndex, config: Pick<IConfiguration, 'getLocale'>): Promise<{ entries: (PlanPage & { day: string })[]; plans: (PlanPage & { scope: string })[] }> {
    const files = await index.get();
    const open = new Map(vscode.workspace.textDocuments.filter(doc => doc.uri.scheme === 'file').map(doc => [Path.normalize(doc.uri.fsPath), doc]));
    const read = async (path: string) => {
        const text = open.get(Path.normalize(path))?.getText() ?? (await index.texts.read(path))?.text;
        return text?.split(/\r?\n/);
    };
    const entries: (PlanPage & { day: string })[] = [];
    for (const [day, path] of files.days) {
        const lines = await read(path);
        if (lines) { entries.push({ path, day, lines }); }
    }
    for (const [week, path] of files.weeks) {
        const m = /^(\d{4})-w(\d+)$/.exec(week);
        const lines = m ? await read(path) : undefined;
        if (m && lines) { entries.push({ path, day: dayWikiTarget(firstDayOfWeek(Number(m[2]), Number(m[1]), config.getLocale())), lines }); }
    }
    const plans: (PlanPage & { scope: string })[] = [];
    for (const note of files.notes.filter(note => note.scope !== SCOPE_DEFAULT)) {
        const lines = await read(note.path);
        if (lines) { plans.push({ path: note.path, scope: note.scope, lines }); }
    }
    return { entries, plans };
}
