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

import * as Path from 'path';
import { IFileSystem } from '../model/index';

/** The text of a file as read at its modification time. */
export interface PageText {
    mtime: number;
    text: string;
}

/**
 * The texts of the journal's files, read once and again only when a file's
 * modification time changed (#320): the one text cache of the search, the
 * backlinks and the entry rows of the smart input.
 */
export class PageTexts {

    private readonly texts = new Map<string, PageText>();

    constructor(private readonly fs: IFileSystem) { }

    /**
     * The text of the file; read again if it changed. Pass the modification
     * time if it is known (saves a stat). Undefined if it cannot be read.
     */
    public async read(path: string, mtime?: number): Promise<PageText | undefined> {
        const key = Path.normalize(path);
        try {
            mtime ??= (await this.fs.stat(path)).mtime;
            const cached = this.texts.get(key);
            if (cached && cached.mtime === mtime) { return cached; }
            const page = { mtime, text: new TextDecoder().decode(await this.fs.readFile(path)) };
            this.texts.set(key, page);
            return page;
        } catch {
            this.texts.delete(key);
            return undefined;
        }
    }

    /** The text read last, without reading. */
    public peek(path: string): PageText | undefined {
        return this.texts.get(Path.normalize(path));
    }

    /** Forgets the texts of files that are no longer in the journal. */
    public retain(paths: Iterable<string>): void {
        const known = new Set([...paths].map(path => Path.normalize(path)));
        for (const key of this.texts.keys()) {
            if (!known.has(key)) { this.texts.delete(key); }
        }
    }
}
