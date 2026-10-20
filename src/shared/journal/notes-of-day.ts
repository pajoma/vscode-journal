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
'use strict';

import * as Path from 'path';
import { NotesOfDay } from 'journal-core';
import { isFileNotFound } from '../fs/fs-exists';
import { IFileSystem, JFileType } from '../model/index';

/**
 * The files of a notes folder that are notes of the day (#279): those
 * `notes.includes` accepts; a folder whose pattern names no day needs each
 * file's creation time (never its modification time). Subfolders are no
 * notes, a missing folder has none. Through IFileSystem, so it is tested
 * without VS Code (#320).
 */
export async function notesOfDayFiles(fs: IFileSystem, notes: NotesOfDay): Promise<string[]> {
    const folder = Path.normalize(notes.folder);
    let entries: [string, JFileType][];
    try {
        entries = await fs.readDirectory(folder);
    } catch (error) {
        if (isFileNotFound(error)) { return []; }
        throw error;
    }
    const files: string[] = [];
    for (const [name, type] of entries) {
        // hidden, temporary and ignored files (journal.notes.ignore, #31) are excluded by notes.includes
        if ((type & JFileType.Directory) !== 0) { continue; }
        const file = Path.join(folder, name);
        if (notes.includes(name, notes.dated ? undefined : await creationTime(fs, file))) {
            files.push(file);
        }
    }
    return files;
}

/** The file's creation time (ctime, not its modification time); undefined if unknown. */
async function creationTime(fs: IFileSystem, file: string): Promise<Date | undefined> {
    try {
        const { ctime } = await fs.stat(file);
        return ctime > 0 ? new Date(ctime) : undefined;
    } catch {
        return undefined;
    }
}
