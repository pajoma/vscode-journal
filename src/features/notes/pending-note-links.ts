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

/**
 * Notes that must be linked from the next synchronised journal entry, although
 * the regular notes-folder scan would not find them (notes in folder scopes are
 * only linked when they are created). Consumed by {@link SyncNoteLinks}.
 */
const pending = new Set<string>();

export function addPendingNoteLink(path: string): void {
    pending.add(path);
}

/** Returns and clears the pending note paths. */
export function takePendingNoteLinks(): string[] {
    const paths = [...pending];
    pending.clear();
    return paths;
}
