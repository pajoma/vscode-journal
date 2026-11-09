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
import { IssueLinkResolver } from './markdown-plugin';

/**
 * How the markdown preview finds issue links (#173): with the settings at
 * parse time, shown in journal files only. Without a document
 * (markdown.api.render with a text) they are shown.
 */
export function previewResolver(ctrl: Pick<JournalController, 'config'>): IssueLinkResolver {
    return {
        matcher: () => issueLinkMatcher(ctrl.config.getIssueLinks()),
        shows: env => {
            // the rendered document is a vscode.Uri when rendering, unset when parsing
            const document = (env as { currentDocument?: vscode.Uri } | undefined)?.currentDocument;
            return document === undefined || inJournal(ctrl, document);
        },
    };
}
