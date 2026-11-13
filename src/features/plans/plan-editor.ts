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
import { CHECKBOX, keyedTasks, progress, scopeNames, scopeRefs } from 'journal-core';
import { inJournal } from '../../shared/journal/in-journal';
import { JournalIndex } from '../../shared/journal/journal-index';
import { OPEN_PLAN_ITEM, planPages, scopeOfPage } from '../../shared/journal/plan-pages';
import { JournalController } from '../../shared/model/index';

type PlanDeps = Pick<JournalController, 'config' | 'logger'>;

/** Waits this long after typing before the plan is shown again. */
const DELAY_MS = 300;

const isPlan = (ctrl: PlanDeps, document: vscode.TextDocument) =>
    document.uri.scheme === 'file' && document.languageId === 'markdown' && scopeOfPage(ctrl.config, document.uri.fsPath) !== undefined;

const linesOf = (document: vscode.TextDocument) => Array.from({ length: document.lineCount }, (_, i) => document.lineAt(i).text);

/**
 * Plans in the editor (docs/specs/2026-11-13-scopes-keys-plans.md): the
 * progress of each item with sub-items after its line (`2/5`, not stored in
 * the file), and an error on keys that two plan items have.
 */
export class PlanEditor implements vscode.Disposable {
    private readonly progressType = vscode.window.createTextEditorDecorationType({
        after: { color: new vscode.ThemeColor('editorCodeLens.foreground'), margin: '0 0 0 1em' },
    });
    private readonly diagnostics = vscode.languages.createDiagnosticCollection('journal-plans');
    private readonly disposables: vscode.Disposable[] = [];
    private timer?: ReturnType<typeof setTimeout>;

    constructor(private readonly ctrl: PlanDeps, private readonly index: JournalIndex) {
        this.disposables.push(
            this.progressType,
            this.diagnostics,
            vscode.window.onDidChangeVisibleTextEditors(() => this.later()),
            vscode.workspace.onDidChangeTextDocument(event => { if (isPlan(this.ctrl, event.document)) { this.later(); } }),
            vscode.workspace.onDidCloseTextDocument(document => this.diagnostics.delete(document.uri)),
        );
        this.later();
    }

    private later(): void {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => { this.update().catch(error => this.ctrl.logger.error("Failed to show the plans.", error)); }, DELAY_MS);
    }

    public async update(): Promise<void> {
        const editors = vscode.window.visibleTextEditors.filter(editor => isPlan(this.ctrl, editor.document));
        for (const editor of editors) {
            const lines = linesOf(editor.document);
            const decorations: vscode.DecorationOptions[] = [];
            lines.forEach((text, line) => {
                if (!CHECKBOX.exec(text)) { return; }
                const { done, total } = progress(lines, line);
                if (total === 0) { return; }
                const end = editor.document.lineAt(line).range.end;
                decorations.push({ range: new vscode.Range(end, end), renderOptions: { after: { contentText: `${done}/${total}` } } });
            });
            editor.setDecorations(this.progressType, decorations);
        }
        if (editors.length) { await this.markDuplicates(editors.map(editor => editor.document)); }
    }

    /** An error on each plan item of the documents whose key another plan item has, too. */
    private async markDuplicates(documents: vscode.TextDocument[]): Promise<void> {
        const scopeName = scopeNames(this.ctrl.config);
        const { plans } = await planPages(this.index, this.ctrl.config);
        const owners = new Map<string, { path: string; line: number }[]>();
        for (const plan of plans) {
            for (const { key, line } of keyedTasks(plan.lines, scopeName)) {
                owners.set(key, [...(owners.get(key) ?? []), { path: plan.path, line }]);
            }
        }
        for (const document of documents) {
            const here = Path.normalize(document.uri.fsPath);
            const found: vscode.Diagnostic[] = [];
            for (const { key, line } of keyedTasks(linesOf(document), scopeName)) {
                const others = (owners.get(key) ?? []).filter(o => Path.normalize(o.path) !== here || o.line !== line);
                if (others.length === 0) { continue; }
                const where = others.map(o => `${Path.basename(o.path)}:${o.line + 1}`).join(', ');
                found.push(new vscode.Diagnostic(document.lineAt(line).range,
                    vscode.l10n.t("The key {0} is the key of another plan item, too ({1}).", key, where), vscode.DiagnosticSeverity.Error));
            }
            this.diagnostics.set(document.uri, found);
        }
    }

    public dispose(): void {
        clearTimeout(this.timer);
        this.disposables.forEach(disposable => disposable.dispose());
    }
}

/** Ctrl+click on the identifier of a key (`:12` of `#acme:12`) in an entry opens its plan item. */
export class KeyLinkProvider implements vscode.DocumentLinkProvider {

    constructor(private readonly ctrl: PlanDeps) { }

    provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
        if (!inJournal(this.ctrl, document.uri) || isPlan(this.ctrl, document)) { return []; }
        const scopeName = scopeNames(this.ctrl.config);
        const links: vscode.DocumentLink[] = [];
        for (let line = 0; line < document.lineCount; line++) {
            for (const ref of scopeRefs(document.lineAt(line).text)) {
                const scope = scopeName(ref.name);
                if (ref.number === undefined || scope === undefined) { continue; }
                const start = ref.index + ref.name.length + 1;
                const key = `#${scope.toLowerCase()}:${ref.number}`;
                const link = new vscode.DocumentLink(new vscode.Range(line, start, line, ref.index + ref.length),
                    vscode.Uri.parse(`command:${OPEN_PLAN_ITEM}?${encodeURIComponent(JSON.stringify([key]))}`));
                link.tooltip = vscode.l10n.t("Open the plan item {0}", key);
                links.push(link);
            }
        }
        return links;
    }
}

/** Opens the plan item of a key, see {@link OPEN_PLAN_ITEM}. */
export class OpenPlanItemCommand implements vscode.Command, vscode.Disposable {
    title: string = 'Open plan item';
    command: string = OPEN_PLAN_ITEM;

    protected constructor(public ctrl: PlanDeps, private readonly index: JournalIndex) { }

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: PlanDeps, index: JournalIndex): vscode.Disposable {
        const cmd = new this(ctrl, index);
        vscode.commands.registerCommand(cmd.command, (key: string) => cmd.execute(key));
        return cmd;
    }

    /** @returns whether a plan item has the key */
    public async execute(key: string): Promise<boolean> {
        this.ctrl.logger.trace("Executing command: ", this.command, key);
        const scopeName = scopeNames(this.ctrl.config);
        const { plans } = await planPages(this.index, this.ctrl.config);
        for (const plan of plans) {
            const item = keyedTasks(plan.lines, scopeName).find(task => task.key === key.toLowerCase());
            if (!item) { continue; }
            const position = new vscode.Position(item.line, 0);
            await vscode.window.showTextDocument(vscode.Uri.file(plan.path), { selection: new vscode.Range(position, position) });
            return true;
        }
        vscode.window.showInformationMessage(vscode.l10n.t("No plan item has the key {0}.", key));
        return false;
    }
}
