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
import { inJournal } from '../../shared/journal/in-journal';
import { JournalController } from '../../shared/model/index';
import { TaskHref } from './markdown-plugin';

/** The path of the links that toggle a task: `vscode://pajoma.vscode-journal/task?doc=…&line=…&hash=…`. */
const TOGGLE_PATH = '/task';

/** The code actions that complete or reopen a task, as in the editor. */
const TOGGLES = ['Complete this task', 'Open this task again'];

/** A short hash of a line (FNV-1a), so that a link toggles only the line it was rendered for. */
export function lineHash(text: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
}

/** Whether a path lies in a hidden folder (`.vscode`, …): generated, no page of the user. */
function hidden(path: string): boolean {
    return path.split('/').slice(0, -1).some(folder => folder.startsWith('.'));
}

/** The link of a task in the preview, for the rendered document; with `scheme` and `extensionId` of VS Code and the extension. */
export function taskHref(scheme: string, extensionId: string): TaskHref {
    return (env, line, text) => {
        const document = (env as { currentDocument?: vscode.Uri } | undefined)?.currentDocument;
        // generated pages in hidden folders (the scope report in .vscode) show copies: a click would change only the copy
        if (!document || hidden(document.path)) { return undefined; }
        const query = new URLSearchParams({ doc: document.toString(), line: String(line), hash: lineHash(text) });
        return `${scheme}://${extensionId}${TOGGLE_PATH}?${query.toString()}`;
    };
}

/**
 * Completes or reopens a task clicked in the markdown preview: the preview
 * opens the `vscode:` link of its box (see `taskPlugin`), VS Code hands it to
 * this handler. Links can also come from elsewhere (a browser), so only a
 * task in a journal file is toggled, and only if its line is still the one
 * the link was rendered for. The code actions of the editor do it: with the
 * done time, and the plan and Super Productivity follow. A file without
 * unsaved changes is saved.
 */
export class TaskToggleHandler implements vscode.UriHandler {

    constructor(private readonly ctrl: Pick<JournalController, 'config' | 'logger' | 'ui'>, private readonly actions: vscode.CodeActionProvider[]) { }

    public async handleUri(uri: vscode.Uri): Promise<void> {
        if (uri.path !== TOGGLE_PATH) { return; }
        try {
            const query = new URLSearchParams(uri.query);
            const target = vscode.Uri.parse(query.get('doc') ?? '');
            const line = Number(query.get('line'));
            if (!inJournal(this.ctrl, target) || hidden(target.path) || !Number.isInteger(line) || line < 0) { return; }
            const document = await vscode.workspace.openTextDocument(target);
            if (line >= document.lineCount || lineHash(document.lineAt(line).text) !== query.get('hash')) {
                vscode.window.showInformationMessage(vscode.l10n.t("The task has changed since the preview was shown. Click it again."));
                return;
            }
            await this.toggle(document, line);
        } catch (error) {
            this.ctrl.logger.error("Failed to toggle the task from the preview.", error);
            this.ctrl.ui.showError(vscode.l10n.t("Failed to change the task."));
        }
    }

    /** Applies the complete or reopen action of the editor to the task at the line; returns whether there was one. */
    public async toggle(document: vscode.TextDocument, line: number): Promise<boolean> {
        const range = new vscode.Range(line, 0, line, 0);
        const context: vscode.CodeActionContext = { diagnostics: [], triggerKind: vscode.CodeActionTriggerKind.Invoke, only: undefined };
        const token = new vscode.CancellationTokenSource().token;
        const offered = (await Promise.all(this.actions.map(provider => provider.provideCodeActions(document, range, context, token)))).flat();
        const action = offered.find((a): a is vscode.CodeAction => !!a && 'title' in a && TOGGLES.includes(a.title) && 'edit' in a);
        if (!action?.edit) { return false; }
        const save = !document.isDirty;
        await vscode.workspace.applyEdit(action.edit);
        if (action.command) { await vscode.commands.executeCommand(action.command.command, ...(action.command.arguments ?? [])); }
        if (save) { await document.save(); }
        return true;
    }
}
