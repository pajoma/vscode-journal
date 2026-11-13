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
import { executions, keyedTasks, planEdits, scopeNames } from 'journal-core';
import { JournalIndex } from '../../shared/journal/journal-index';
import { planPages } from '../../shared/journal/plan-pages';
import { JournalController } from '../../shared/model/index';

type UpdateDeps = Pick<JournalController, 'config' | 'logger' | 'events'>;

/**
 * Keeps the plans of the scopes in step with the journal
 * (docs/specs/2026-11-13-scopes-keys-plans.md): after an entry with keys was
 * saved, or a code action completed or reopened a task with a key (see
 * `TasksChangedEvent`), the plan
 * items of its keys follow their latest execution (see journal-core
 * `planEdits`). Changed plan files are saved, unless they had unsaved changes.
 */
export class PlanUpdater implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private running: Promise<void> = Promise.resolve();

    constructor(private readonly ctrl: UpdateDeps, private readonly index: JournalIndex) {
        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument(document => { void this.update(document.uri); }),
            ctrl.events.onTasksChanged(({ path, change }) => {
                if (change === 'done' || change === 'reopened') { void this.update(vscode.Uri.file(path)); }
            }),
        );
    }

    /**
     * Updates the plan items of the keys of the entry at `uri` (all keys
     * without it); one update after the other.
     */
    public update(uri?: vscode.Uri): Promise<void> {
        this.running = this.running.then(() => this.apply(uri)).catch(error => this.ctrl.logger.error("Failed to update the plans.", error));
        return this.running;
    }

    private async apply(uri?: vscode.Uri): Promise<void> {
        const scopeName = scopeNames(this.ctrl.config);
        const { entries, plans } = await planPages(this.index, this.ctrl.config);
        let only: Set<string> | undefined;
        if (uri) {
            const entry = entries.find(page => Path.normalize(page.path) === Path.normalize(uri.fsPath));
            // only entries change plans; a plan file is changed by hand
            if (!entry) { return; }
            only = new Set(keyedTasks(entry.lines, scopeName).map(task => task.key));
            if (only.size === 0) { return; }
        }

        const executed = executions(entries, scopeName);
        const edit = new vscode.WorkspaceEdit();
        const save: vscode.TextDocument[] = [];
        for (const plan of plans) {
            const changes = planEdits(plan.lines, executed, scopeName, only);
            if (changes.length === 0) { continue; }
            const document = await vscode.workspace.openTextDocument(plan.path);
            if (!document.isDirty) { save.push(document); }
            for (const { line, text } of changes) {
                // a line changed since it was read is left alone
                if (line < document.lineCount && document.lineAt(line).text === plan.lines[line]) {
                    edit.replace(document.uri, document.lineAt(line).range, text);
                }
            }
        }
        if (edit.size === 0) { return; }
        await vscode.workspace.applyEdit(edit);
        await Promise.all(save.map(document => document.save()));
    }

    public dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose());
    }
}
