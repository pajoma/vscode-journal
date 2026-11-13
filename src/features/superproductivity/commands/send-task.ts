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
import { keyName, keyOf } from 'journal-core';
import { JournalIndex } from '../../../shared/journal/journal-index';
import { SuperProductivityClient, SuperProductivitySettings } from '../client';
import { failureMessage } from '../host';
import { MappingFile } from '../mapping';
import { newTask } from '../projects';
import { linesOf, projectMap, replaceLines, Session, SessionDeps } from '../session';
import { taskText } from '../sync';

/**
 * Triggered by the code action on an open task: gives it a key if it has
 * none, creates it in Super Productivity (see `newTask`) and links the key to
 * the task in the mapping (docs/specs/2026-11-13-scopes-keys-plans.md).
 */
export class SendTaskCommand implements vscode.Command, vscode.Disposable {
    title: string = 'Send task to Super Productivity';
    static readonly command = 'journal.commands.send-task-to-super-productivity';
    command: string = SendTaskCommand.command;

    protected constructor(public ctrl: SessionDeps, private readonly client: SuperProductivityClient, private readonly settings: () => SuperProductivitySettings, private readonly index: JournalIndex, private readonly file: MappingFile) { }

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: SessionDeps, client: SuperProductivityClient, settings: () => SuperProductivitySettings, index: JournalIndex, file: MappingFile): vscode.Disposable {
        const cmd = new this(ctrl, client, settings, index, file);
        vscode.commands.registerCommand(cmd.command, (uri: vscode.Uri, line: number) => cmd.execute(uri, line));
        return cmd;
    }

    /** @returns the key of the task, undefined if nothing was sent */
    public async execute(uri: vscode.Uri, line: number): Promise<string | undefined> {
        this.ctrl.logger.trace("Executing command: ", this.command);
        const session = await Session.open(this.ctrl, this.index, this.file);
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const page = await session.page(uri.fsPath);
            const before = linesOf(document);
            const linked = keyName(before[line] ?? '', session.scopeName);
            if (linked && session.mapping.get(linked)) { return undefined; }

            const { edits } = await session.keyLines(before, [line], page.scope);
            const edit = new vscode.WorkspaceEdit();
            replaceLines(edit, document, before, edits);
            await vscode.workspace.applyEdit(edit);

            const lines = linesOf(document);
            const key = keyOf(lines[line], session.scopeName);
            const name = keyName(lines[line], session.scopeName);
            // the line changed meanwhile, or it was a link of the beta
            if (!key || !name || session.mapping.get(name)) { return undefined; }
            const created = newTask(lines, line, key, taskText(lines[line], this.ctrl.config.getTaskInlineTemplate().template), page, await projectMap(this.client, this.settings()), session.scopeName);
            const task = await this.client.createTask(created.title, created.where);
            session.mapping.set(name, task.id);
            return name;
        } catch (error) {
            this.ctrl.logger.error("Failed to execute command: ", this.command, "Reason: ", error);
            this.ctrl.ui.showError(failureMessage(error));
            return undefined;
        } finally {
            await session.save();
        }
    }
}
