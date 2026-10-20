// Copyright (C) 2026 Patrick Maué
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
import { IWorkspaceConfigReader } from '../shared/model/index';

/**
 * Reads the `journal.*` settings on every access. A `WorkspaceConfiguration`
 * returned by `getConfiguration()` is a snapshot: holding it would ignore every
 * settings change until the window is reloaded (#253).
 */
export class LiveWorkspaceConfig implements IWorkspaceConfigReader {

    constructor(private readonly section: string = 'journal') { }

    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    get<T>(key: string, defaultValue?: T): T | undefined {
        const config = vscode.workspace.getConfiguration(this.section);
        return defaultValue === undefined ? config.get<T>(key) : config.get<T>(key, defaultValue);
    }
}
