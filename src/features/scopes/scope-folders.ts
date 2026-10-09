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
import { JFileType, JournalController } from '../../shared/model/index';

/** Allowed scope names: they are used as tag (`#name`) and as folder name. */
export const SCOPE_NAME = /^[A-Za-z0-9_-]+$/;

/**
 * Scans the scope root (`journal.scopeRoot`) and registers its sub-folders as
 * scopes. A missing scope root simply means: no folder scopes.
 */
export async function refreshScopeFolders(ctrl: JournalController): Promise<string[]> {
    const root = ctrl.config.getScopeRoot();
    let names: string[] = [];
    try {
        names = (await ctrl.fs.readDirectory(root))
            .filter(([name, type]) => type === JFileType.Directory && SCOPE_NAME.test(name))
            .map(([name]) => name)
            .sort((a, b) => a.localeCompare(b));
    } catch {
        ctrl.logger.trace("No scope root found at", root);
    }
    ctrl.config.setScopeFolders(names);
    return names;
}

/**
 * Keeps the folder scopes current: rescans when folders are added or removed
 * below the scope root, and when journal settings change (the scope root may
 * be a different folder then, so the file watcher is recreated).
 */
export function watchScopeFolders(ctrl: JournalController): vscode.Disposable {
    const refresh = () => refreshScopeFolders(ctrl).catch(err => ctrl.logger.error("Failed to scan scope folders.", err));

    let root = ctrl.config.getScopeRoot();
    const watch = () => {
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(vscode.Uri.file(root), '*'), false, true, false);
        watcher.onDidCreate(refresh);
        watcher.onDidDelete(refresh);
        return watcher;
    };
    let watcher = watch();

    const onConfig = vscode.workspace.onDidChangeConfiguration(e => {
        if (!e.affectsConfiguration('journal')) { return; }
        const next = ctrl.config.getScopeRoot();
        if (next !== root) {
            root = next;
            watcher.dispose();
            watcher = watch();
        }
        refresh();
    });
    return vscode.Disposable.from(onConfig, { dispose: () => watcher.dispose() });
}
