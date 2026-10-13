// Copyright (C) 2021 Patrick Maué
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
// 

'use strict';

import * as vscode from 'vscode';
import { JournalSettings } from 'journal-core';

/** Remote sessions (SSH, WSL, containers): where the journal opens. The VS Code side of shared/paths. */

export function isRemoteSession(): boolean {
    return !!vscode.env.remoteName;
}

/**
 * True in a WSL session whose journal base is a Windows path (C:\...): the
 * remote reaches it as /mnt/c/..., so the journal opens there directly. Handing
 * a vscode://file link to the local client instead opened an empty editor with
 * a mixed path such as /C:\Users\...\journal/2026/05/18.md (#228).
 */
export function opensWindowsBaseInWsl(config: JournalSettings, scopeId?: string): boolean {
    return vscode.env.remoteName === 'wsl' && config.isWindowsStyleBaseConfigured(scopeId);
}

export function toLocalFileUri(path: string): vscode.Uri {
    const normalized = path.replace(/\\/g, '/');
    const isWindowsDrivePath = /^[a-zA-Z]:\//.test(normalized);
    if (isWindowsDrivePath) {
        return vscode.Uri.parse(`${vscode.env.uriScheme}://file/${normalized}`);
    }
    if (normalized.startsWith('/')) {
        return vscode.Uri.parse(`${vscode.env.uriScheme}://file${normalized}`);
    }
    return vscode.Uri.parse(`${vscode.env.uriScheme}://file/${normalized}`);
}
