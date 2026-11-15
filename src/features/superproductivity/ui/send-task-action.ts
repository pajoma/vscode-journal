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
import { CHECKBOX, keyName, scopeNames } from 'journal-core';
import { inJournal } from '../../../shared/journal/in-journal';
import { JournalController } from '../../../shared/model/index';
import { SuperProductivitySettings } from '../client';
import { SendTaskCommand } from '../commands/send-task';
import { MappingFile, TaskMapping } from '../mapping';

/**
 * Offers "Send to Super Productivity" on the open tasks (and plan items in
 * progress) of journal files that are not linked yet, while the integration
 * is on.
 */
export class SendTaskAction implements vscode.CodeActionProvider {

    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    constructor(private readonly ctrl: Pick<JournalController, 'config'>, private readonly settings: () => SuperProductivitySettings, private readonly file: MappingFile) { }

    async provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection): Promise<vscode.CodeAction[]> {
        if (!this.settings().enabled || !inJournal(this.ctrl, document.uri)) { return []; }
        const line = document.lineAt(range.start.line).text;
        const box = CHECKBOX.exec(line);
        if (!box || !box[4].trim() || (box[3] !== undefined && box[3] !== '/')) { return []; }
        const key = keyName(line, scopeNames(this.ctrl.config));
        if (key && await this.linked(key)) { return []; }

        const fix = new vscode.CodeAction(vscode.l10n.t("Send to Super Productivity"), vscode.CodeActionKind.QuickFix);
        fix.command = { command: SendTaskCommand.command, title: 'Send task to Super Productivity', arguments: [document.uri, range.start.line] };
        return [fix];
    }

    private mapping?: { at: number; mapping: TaskMapping };

    /** Whether the key is linked; the mapping is read at most every few seconds (code actions are asked for on every cursor move). */
    private async linked(key: string): Promise<boolean> {
        if (!this.mapping || Date.now() - this.mapping.at > 5000) { this.mapping = { at: Date.now(), mapping: await this.file.load() }; }
        return this.mapping.mapping.get(key) !== undefined;
    }
}
