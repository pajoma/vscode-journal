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
import { formatOutline, isNumbered, numberedCopies, numberedId, renumberEdits, scopeNames } from 'journal-core';
import { JournalIndex } from '../../shared/journal/journal-index';
import { planPages, planTarget, scopeOfPage } from '../../shared/journal/plan-pages';
import { pathKey } from '../../shared/paths';
import { JournalController } from '../../shared/model/index';

type NumberingDeps = Pick<JournalController, 'config' | 'logger'>;

/**
 * Keeps the outline numbers of plans in order (docs/specs/2026-11-13-scopes-keys-plans.md,
 * decision 26): a numbered plan is renumbered when it is saved, like a table
 * of contents, and the copies of its items in the journal get the new
 * numbers. A plan is numbered from the first time an item of it is planned
 * for a day; plans without numbers stay as they are.
 */
export class PlanNumbering implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    /** The numbers a save changed, by plan, until the save is done. */
    private readonly renamed = new Map<string, Map<string, string>>();

    constructor(private readonly ctrl: NumberingDeps, private readonly index: JournalIndex) {
        this.disposables.push(
            vscode.workspace.onWillSaveTextDocument(event => {
                const scope = event.document.uri.scheme === 'file' ? scopeOfPage(this.ctrl.config, event.document.uri.fsPath) : undefined;
                const lines = linesOf(event.document);
                if (!scope || !isNumbered(lines)) { return; }
                const { edits, renamed } = renumberEdits(lines);
                if (edits.length === 0) { return; }
                if (renamed.size) { this.renamed.set(pathKey(event.document.uri.fsPath), renamed); }
                event.waitUntil(Promise.resolve(edits.map(({ line, text }) => vscode.TextEdit.replace(event.document.lineAt(line).range, text))));
            }),
            vscode.workspace.onDidSaveTextDocument(document => {
                const key = pathKey(document.uri.fsPath);
                const renamed = this.renamed.get(key);
                const scope = scopeOfPage(this.ctrl.config, document.uri.fsPath);
                this.renamed.delete(key);
                if (renamed && scope) { void this.followed(document.uri.fsPath, scope, renamed); }
            }),
        );
    }

    /** Numbers the plan in the editor now (before an item is planned for a day); its copies get changed numbers. */
    public async renumber(document: vscode.TextDocument, scope: string): Promise<void> {
        const { edits, renamed } = renumberEdits(linesOf(document));
        if (edits.length === 0) { return; }
        const edit = new vscode.WorkspaceEdit();
        for (const { line, text } of edits) { edit.replace(document.uri, document.lineAt(line).range, text); }
        await vscode.workspace.applyEdit(edit);
        if (renamed.size) { await this.followed(document.uri.fsPath, scope, renamed); }
    }

    /** The copies of the plan's items in the entries get the changed numbers; entries without unsaved changes are saved. */
    private async followed(plan: string, scope: string, renamed: ReadonlyMap<string, string>): Promise<void> {
        try {
            const prefix = numberedId({ scope, target: await planTarget(this.index, plan) }, '');
            const scopeName = scopeNames(this.ctrl.config);
            const { entries } = await planPages(this.index, this.ctrl.config);
            const edit = new vscode.WorkspaceEdit();
            const save: vscode.TextDocument[] = [];
            for (const entry of entries) {
                const copies = numberedCopies(entry.lines, scopeName).filter(copy => copy.id.startsWith(prefix) && renamed.has(copy.number.number));
                if (copies.length === 0) { continue; }
                const document = await vscode.workspace.openTextDocument(entry.path);
                if (!document.isDirty) { save.push(document); }
                for (const { line, number } of copies) {
                    // a line changed since it was read is left alone
                    if (line >= document.lineCount || document.lineAt(line).text !== entry.lines[line]) { continue; }
                    edit.replace(document.uri, new vscode.Range(line, number.index, line, number.index + number.length), formatOutline(renamed.get(number.number)!));
                }
            }
            if (edit.size === 0) { return; }
            await vscode.workspace.applyEdit(edit);
            await Promise.all(save.map(document => document.save()));
        } catch (error) {
            this.ctrl.logger.error("Failed to renumber the copies of a plan.", error);
        }
    }

    public dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose());
    }
}

function linesOf(document: vscode.TextDocument): string[] {
    return Array.from({ length: document.lineCount }, (_, i) => document.lineAt(i).text);
}
