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
import moment = require('moment');
import { CHECKBOX, highestKeys, keyOf, LINE_KINDS, scopeNames, scopeOf, subtasksToMove, TASK_BOX, TaskKey, withKey } from 'journal-core';
import { JournalIndex } from '../../shared/journal/journal-index';
import { PULL_PLAN_ITEM, scopeOfPage } from '../../shared/journal/plan-pages';
import { JournalController } from '../../shared/model/index';

type PullDeps = Pick<JournalController, 'config' | 'keys' | 'logger' | 'ui' | 'reader' | 'inject' | 'editor'>;

/** The day of a target of the task code actions: 0 the next working day, 1 tomorrow, 2 today (as `ShiftTarget`). */
export function targetDay(target: number, now: Date = new Date()): Date {
    const day = moment(now);
    if (target === 2) { return day.toDate(); }
    if (target === 1) { return day.add(1, 'd').toDate(); }
    // the next working day: Monday after Friday, Saturday and Sunday
    return day.add(day.day() === 5 ? 3 : day.day() === 6 ? 2 : 1, 'd').toDate();
}

/**
 * Pulls an item of a plan into a day (docs/specs/2026-11-13-scopes-keys-plans.md):
 * the item and its open sub-items get keys (of the scope they name, else of
 * the scope of the plan), are copied into the entry of the day with a link
 * to the plan, and are marked in progress (`[/]`) in the plan.
 */
export class PullPlanItemCommand implements vscode.Command, vscode.Disposable {
    title: string = 'Pull a plan item into a day';
    command: string = PULL_PLAN_ITEM;

    protected constructor(public ctrl: PullDeps, private readonly index: JournalIndex) { }

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: PullDeps, index: JournalIndex): vscode.Disposable {
        const cmd = new this(ctrl, index);
        vscode.commands.registerCommand(cmd.command, (uri: vscode.Uri, line: number, target: number) => cmd.execute(uri, line, target));
        return cmd;
    }

    /** @param target the day, as the copy-task command takes it (next working day, tomorrow, today) */
    public async execute(uri: vscode.Uri, line: number, target: number): Promise<void> {
        this.ctrl.logger.trace("Executing command: ", this.command);
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const plan = scopeOfPage(this.ctrl.config, uri.fsPath);
            const box = line < document.lineCount ? CHECKBOX.exec(document.lineAt(line).text) : null;
            if (!plan || !box || box[3] !== undefined) { return; }

            // 1. keys for the item and its open sub-items
            const lines = () => Array.from({ length: document.lineCount }, (_, i) => document.lineAt(i).text);
            const items = [line, ...subtasksToMove(lines(), line).open];
            await this.giveKeys(document, items, plan);

            // 2. the copy for the day, with the keys, before the items are marked in progress
            const keyed = lines();
            const moving = subtasksToMove(keyed, line);
            const text = CHECKBOX.exec(keyed[line])![4].trim() + await this.linkTo(uri.fsPath);

            // 3. in progress in the plan
            const edit = new vscode.WorkspaceEdit();
            for (const i of [line, ...moving.open]) {
                const at = keyed[i].indexOf('[');
                edit.replace(uri, new vscode.Range(i, at, i, keyed[i].indexOf(']', at) + 1), TASK_BOX.progress);
            }
            await vscode.workspace.applyEdit(edit);

            // 4. the copy in the entry of the day, its open sub-items below it
            const entry = await this.ctrl.reader.loadEntryForDay(targetDay(target));
            await this.ctrl.inject.place(entry, this.ctrl.config.getTaskInlineTemplate(), LINE_KINDS.task, [{ values: [["${input}", text]], below: moving.lines }]);
            await this.ctrl.editor.save(entry);
        } catch (error) {
            this.ctrl.logger.error("Failed to execute command: ", this.command, "Reason: ", error);
            this.ctrl.ui.showError(vscode.l10n.t("Failed to plan the item for the day."));
        }
    }

    /** Gives the lines without key the next keys: of the scope they name, else of the scope of the plan. */
    private async giveKeys(document: vscode.TextDocument, items: number[], plan: string): Promise<void> {
        const scopeName = scopeNames(this.ctrl.config);
        const missing = items.filter(i => !keyOf(document.lineAt(i).text, scopeName));
        if (missing.length === 0) { return; }
        const highest = highestKeys(await this.ctrl.keys.texts());
        const edit = new vscode.WorkspaceEdit();
        for (const i of missing) {
            const text = document.lineAt(i).text;
            const box = CHECKBOX.exec(text)!;
            const scope = scopeOf(box[4], scopeName) ?? plan;
            const number = (highest.get(scope.toLowerCase()) ?? 0) + 1;
            highest.set(scope.toLowerCase(), number);
            const key: TaskKey = { scope, number };
            edit.replace(document.uri, document.lineAt(i).range, text.slice(0, text.length - box[4].length) + withKey(box[4], key, scopeName));
        }
        await vscode.workspace.applyEdit(edit);
    }

    /** " [[Plan]]": the wiki link to the plan, as the journal names it. */
    private async linkTo(path: string): Promise<string> {
        const files = await this.index.get();
        const target = [...files.targets].find(([file]) => Path.normalize(file) === Path.normalize(path))?.[1]
            ?? Path.parse(path).name.replace(/_/g, ' ');
        return ` [[${target}]]`;
    }
}
