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
import { parseWikiTarget, wikiLinks } from 'journal-core';
import { JournalController } from '../../shared/model/index';

/** The command a wiki link runs on Ctrl+click: arguments target and the file the link is in. */
export const OPEN_WIKI_LINK = 'journal.openWikiLink';

/**
 * Makes `[[…]]` in journal files clickable (#92): Ctrl+click runs
 * {@link OPEN_WIKI_LINK}, which finds (or creates) the target when clicked,
 * so the provider does not read the journal.
 */
export class WikiLinkProvider implements vscode.DocumentLinkProvider {

    constructor(private readonly ctrl: JournalController) { }

    provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
        if (!this.inJournal(document.uri)) { return []; }
        const text = document.getText();
        return wikiLinks(text).map(link => {
            const range = new vscode.Range(document.positionAt(link.index), document.positionAt(link.index + link.length));
            const args = encodeURIComponent(JSON.stringify([link.target, document.uri.fsPath]));
            const target = vscode.Uri.parse(`command:${OPEN_WIKI_LINK}?${args}`);
            const documentLink = new vscode.DocumentLink(range, target);
            documentLink.tooltip = tooltip(link.target);
            return documentLink;
        });
    }

    private inJournal(uri: vscode.Uri): boolean {
        return inJournal(this.ctrl, uri);
    }
}

/** Files below a journal base (or the scope root): wiki links mean nothing elsewhere. */
export function inJournal(ctrl: JournalController, uri: vscode.Uri): boolean {
    if (uri.scheme !== 'file') { return false; }
    const file = Path.normalize(uri.fsPath);
    const folders = [ctrl.config.getScopeRoot(), ...ctrl.config.getScopeList().map(scope => ctrl.config.getBasePath(scope.isDefault ? undefined : scope.name))];
    return folders.some(folder => folder && file.startsWith(Path.normalize(folder) + Path.sep));
}

function tooltip(target: string): string {
    const parsed = parseWikiTarget(target);
    return parsed.kind === 'day' ? vscode.l10n.t("Open the entry of {0}", target)
        : parsed.kind === 'week' ? vscode.l10n.t("Open the weekly entry {0}", target)
            : vscode.l10n.t("Open the note \"{0}\" (created if missing)", parsed.title);
}
