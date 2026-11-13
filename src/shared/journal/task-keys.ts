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
import { nextKey, TaskKey } from 'journal-core';
import { IConfiguration, ITaskKeys } from '../model/index';
import { JournalIndex } from './journal-index';

/** The scope `name` names (as configured, case ignored); undefined for no scope. For journal-core's `scopeOf`, `keyOf`, … */
export function scopeNameIn(config: Pick<IConfiguration, 'getScope'>): (name: string) => string | undefined {
    return name => {
        const scope = config.getScope(name);
        return scope.isDefault ? undefined : scope.name;
    };
}

/**
 * The keys of tasks over the whole journal: daily and weekly entries and the
 * notes of every scope, open documents as in the editor (a key given a moment
 * ago is in an unsaved document).
 */
export class TaskKeys implements ITaskKeys {

    constructor(private readonly index: () => JournalIndex) { }

    public async next(scope?: string): Promise<TaskKey> {
        return nextKey(await this.texts(), scope);
    }

    public async texts(): Promise<string[]> {
        const index = this.index();
        const files = await index.get();
        const open = new Map(vscode.workspace.textDocuments.filter(doc => doc.uri.scheme === 'file').map(doc => [Path.normalize(doc.uri.fsPath), doc.getText()]));
        const texts: string[] = [...open.values()];
        for (const path of [...files.days.values(), ...files.weeks.values(), ...files.notes.map(note => note.path)]) {
            if (open.has(Path.normalize(path))) { continue; }
            const text = (await index.texts.read(path))?.text;
            if (text !== undefined) { texts.push(text); }
        }
        return texts;
    }
}
