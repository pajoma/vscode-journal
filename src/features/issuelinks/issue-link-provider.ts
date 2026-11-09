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
import { issueLinkMatcher } from 'journal-core';
import { inJournal } from '../../shared/journal/in-journal';
import { JournalController } from '../../shared/model/index';

/**
 * Makes issue references such as `pida#23` in journal files clickable
 * (#173): Ctrl+click opens the URL that `journal.issueLinks` gives for the
 * prefix.
 */
export class IssueLinkProvider implements vscode.DocumentLinkProvider {

    constructor(private readonly ctrl: Pick<JournalController, 'config'>) { }

    provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
        if (!inJournal(this.ctrl, document.uri)) { return []; }
        return issueLinkMatcher(this.ctrl.config.getIssueLinks())(document.getText()).flatMap(link => {
            const target = parseUrl(link.url);
            if (!target) { return []; }
            const range = new vscode.Range(document.positionAt(link.index), document.positionAt(link.index + link.length));
            const documentLink = new vscode.DocumentLink(range, target);
            documentLink.tooltip = vscode.l10n.t("Open {0} ({1})", link.text, link.url);
            return [documentLink];
        });
    }
}

/** The URL as a Uri; undefined if it is no valid URI (a typo in the setting). */
function parseUrl(url: string): vscode.Uri | undefined {
    try { return vscode.Uri.parse(url, true); } catch { return undefined; }
}
