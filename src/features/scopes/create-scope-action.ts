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
import { SCOPE_DEFAULT, scopeNames, scopeRefs, SLUG } from 'journal-core';
import { inJournal } from '../../shared/journal/in-journal';
import { JournalController } from '../../shared/model/index';

/**
 * Offers "Create scope #acme" on a tag of a journal file that names no
 * scope yet: people reach scopes through the tags they already write.
 * Only on the tag at the cursor, and only for a tag that can be a slug.
 */
export class CreateScopeAction implements vscode.CodeActionProvider {

    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

    constructor(private readonly ctrl: Pick<JournalController, 'config'>) { }

    provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection): vscode.CodeAction[] {
        if (!range.isSingleLine || !inJournal(this.ctrl, document.uri)) { return []; }
        const text = document.lineAt(range.start.line).text;
        const at = range.start.character;
        const ref = scopeRefs(text).find(r => r.number === undefined && r.index <= at && at <= r.index + r.length);
        const slug = ref?.name.toLowerCase();
        if (!slug || !SLUG.test(slug) || slug === SCOPE_DEFAULT || scopeNames(this.ctrl.config)(slug) !== undefined) { return []; }
        const action = new vscode.CodeAction(vscode.l10n.t("Create scope #{0}", slug), vscode.CodeActionKind.QuickFix);
        action.command = { command: 'journal.createScope', title: 'Create Scope', arguments: [slug] };
        return [action];
    }
}
