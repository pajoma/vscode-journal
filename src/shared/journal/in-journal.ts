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
import { JournalController } from '../model/index';

/**
 * Files below a journal base (or the scope root): wiki links (#92) and issue
 * links (#173) mean nothing elsewhere.
 */
export function inJournal(ctrl: Pick<JournalController, 'config'>, uri: vscode.Uri): boolean {
    if (uri.scheme !== 'file') { return false; }
    const file = Path.normalize(uri.fsPath);
    const folders = [ctrl.config.getScopeRoot(), ...ctrl.config.getScopeList().map(scope => ctrl.config.getBasePath(scope.isDefault ? undefined : scope.name))];
    return folders.some(folder => folder && file.startsWith(Path.normalize(folder) + Path.sep));
}
