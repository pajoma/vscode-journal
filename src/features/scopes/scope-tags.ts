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
import { scopeNames, scopeTags } from 'journal-core';
import { inJournal } from '../../shared/journal/in-journal';
import { JournalController } from '../../shared/model/index';
import { onDidChangeScopes } from './scope-folders';
import { reportUri, ScopeReportProvider } from './scope-report';

/** Shows a scope: `(slug: string)`. */
export const SHOW_SCOPE = 'journal.showScope';

/** The theme color of scope tags (package.json `colors`). */
const SCOPE_TAG_COLOR = 'journal.scopeTag';

/** Waits this long after typing before the scope tags are shown again. */
const DELAY_MS = 200;

/** The scope tags of a journal document (`#acme`, also in a key `#acme:12`); none for other documents. */
function scopeTagsOf(ctrl: Pick<JournalController, 'config'>, document: vscode.TextDocument): { range: vscode.Range; scope: string }[] {
    if (document.languageId !== 'markdown' || !inJournal(ctrl, document.uri)) { return []; }
    const scopeName = scopeNames(ctrl.config);
    const result: { range: vscode.Range; scope: string }[] = [];
    for (let line = 0; line < document.lineCount; line++) {
        for (const tag of scopeTags(document.lineAt(line).text, scopeName)) {
            result.push({ range: new vscode.Range(line, tag.index, line, tag.index + tag.length), scope: tag.scope });
        }
    }
    return result;
}

/**
 * Shows the scope tags of journal files apart from other tags (the grammar
 * cannot: it does not know the scopes), in the theme color `journal.scopeTag`;
 * again when the document or the scopes change
 * (docs/specs/2026-11-13-scopes-keys-plans.md).
 */
export class ScopeTagDecorations implements vscode.Disposable {
    private readonly type = vscode.window.createTextEditorDecorationType({ color: new vscode.ThemeColor(SCOPE_TAG_COLOR) });
    private readonly disposables: vscode.Disposable[] = [];
    private timer?: ReturnType<typeof setTimeout>;

    constructor(private readonly ctrl: Pick<JournalController, 'config'>) {
        this.disposables.push(
            this.type,
            vscode.window.onDidChangeVisibleTextEditors(() => this.update()),
            vscode.workspace.onDidChangeTextDocument(event => {
                if (vscode.window.visibleTextEditors.some(editor => editor.document === event.document)) { this.later(); }
            }),
            vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('journal')) { this.later(); } }),
            onDidChangeScopes(() => this.later()),
        );
        this.update();
    }

    private later(): void {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.update(), DELAY_MS);
    }

    public update(): void {
        for (const editor of vscode.window.visibleTextEditors) {
            editor.setDecorations(this.type, scopeTagsOf(this.ctrl, editor.document).map(tag => tag.range));
        }
    }

    public dispose(): void {
        clearTimeout(this.timer);
        this.disposables.forEach(disposable => disposable.dispose());
    }
}

/** Ctrl+click on a scope tag shows the scope ({@link SHOW_SCOPE}). */
export class ScopeTagLinkProvider implements vscode.DocumentLinkProvider {

    constructor(private readonly ctrl: Pick<JournalController, 'config'>) { }

    provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
        return scopeTagsOf(this.ctrl, document).map(({ range, scope }) => {
            const link = new vscode.DocumentLink(range, vscode.Uri.parse(`command:${SHOW_SCOPE}?${encodeURIComponent(JSON.stringify([scope]))}`));
            link.tooltip = vscode.l10n.t("Show the scope {0}", scope);
            return link;
        });
    }
}

/**
 * Shows a scope: its report (see `ScopeReportProvider`), generated again each
 * time, in the markdown preview.
 */
export class ShowScopeCommand implements vscode.Command, vscode.Disposable {
    title: string = 'Show scope';
    command: string = SHOW_SCOPE;

    protected constructor(public ctrl: Pick<JournalController, 'config' | 'logger'>, private readonly reports: ScopeReportProvider) { }

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: Pick<JournalController, 'config' | 'logger'>, reports: ScopeReportProvider): vscode.Disposable {
        const cmd = new this(ctrl, reports);
        vscode.commands.registerCommand(cmd.command, (slug?: string) => cmd.execute(slug));
        return cmd;
    }

    /** @param slug the scope; asks for it if omitted (command palette) */
    public async execute(slug?: string): Promise<void> {
        this.ctrl.logger.trace("Executing command: ", this.command, slug);
        const scope = typeof slug === 'string' ? slug : await vscode.window.showQuickPick(this.ctrl.config.getScopes().slice(1).map(name => `#${name}`), {
            placeHolder: vscode.l10n.t("Scope to show"),
        });
        if (!scope) { return; }
        const uri = reportUri(this.ctrl.config.getScope(scope.replace(/^#/, '')).name);
        this.reports.refresh(uri);
        await vscode.commands.executeCommand('markdown.showPreview', uri);
    }
}
