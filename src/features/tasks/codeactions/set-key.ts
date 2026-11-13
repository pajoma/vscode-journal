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
import { CHECKBOX, formatKey, keyOf, scopeOf, withKey } from 'journal-core';
import { inJournal } from '../../../shared/journal/in-journal';
import { scopeNameIn } from '../../../shared/journal/task-keys';
import { JournalController } from '../../../shared/model/index';

/** Gives the task at a line its key: `(uri: vscode.Uri, line: number)`. */
export const SET_TASK_KEY = 'journal.commands.set-task-key';

/**
 * Offers "Set Identifier" on the tasks of journal files that have no key yet
 * (docs/specs/2026-11-13-scopes-keys-plans.md); moved tasks (`[>]`) keep the
 * key of their copy, they get none.
 */
export class SetKeyActions implements vscode.CodeActionProvider {

    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    constructor(private readonly ctrl: Pick<JournalController, 'config'>) { }

    provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection): vscode.CodeAction[] {
        if (!inJournal(this.ctrl, document.uri)) { return []; }
        const line = document.lineAt(range.start.line).text;
        const box = CHECKBOX.exec(line);
        if (!box || box[3] === '>' || !box[4].trim() || keyOf(line, scopeNameIn(this.ctrl.config))) { return []; }

        const fix = new vscode.CodeAction(vscode.l10n.t("Set Identifier"), vscode.CodeActionKind.QuickFix);
        fix.command = { command: SET_TASK_KEY, title: 'Set Identifier', arguments: [document.uri, range.start.line] };
        return [fix];
    }
}

/**
 * Gives the task its key: the next of the scope it names (`+acme` becomes
 * `+acme:12`), else the next of the default scope in front of its text
 * (`- [ ] :7 call the bank`).
 */
export class SetKeyCommand implements vscode.Command, vscode.Disposable {
    title: string = 'Set Identifier';
    command: string = SET_TASK_KEY;

    protected constructor(public ctrl: Pick<JournalController, 'config' | 'keys' | 'logger' | 'ui'>) { }

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: Pick<JournalController, 'config' | 'keys' | 'logger' | 'ui'>): vscode.Disposable {
        const cmd = new this(ctrl);
        vscode.commands.registerCommand(cmd.command, (uri: vscode.Uri, line: number) => cmd.execute(uri, line));
        return cmd;
    }

    /** @returns the key as written, undefined if the line is no task without key (any more) */
    public async execute(uri: vscode.Uri, line: number): Promise<string | undefined> {
        this.ctrl.logger.trace("Executing command: ", this.command);
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const scopeName = scopeNameIn(this.ctrl.config);
            const text = document.lineAt(line).text;
            const box = CHECKBOX.exec(text);
            if (!box || keyOf(text, scopeName)) { return undefined; }

            const key = await this.ctrl.keys.next(scopeOf(box[4], scopeName));
            // the line may have changed while the journal was read
            if (line >= document.lineCount || document.lineAt(line).text !== text) { return undefined; }
            const prefix = text.slice(0, text.length - box[4].length);
            const edit = new vscode.WorkspaceEdit();
            edit.replace(uri, document.lineAt(line).range, prefix + withKey(box[4], key, scopeName));
            await vscode.workspace.applyEdit(edit);
            return keyOf(document.lineAt(line).text, scopeName) ? formatKey(key) : undefined;
        } catch (error) {
            this.ctrl.logger.error("Failed to execute command: ", this.command, "Reason: ", error);
            this.ctrl.ui.showError(vscode.l10n.t("Failed to set the identifier of the task."));
            return undefined;
        }
    }
}
