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
//
'use strict';

import * as Path from 'path';
import { JournalPaths, JournalScopes, JournalSettings } from 'journal-core';
import { denormalizeFilename } from '../../shared/index';
import { FileEntry, IFileSystem, JournalPageType, SCOPE_DEFAULT } from '../../shared/model/index';
import { getJournalDate } from '../../shared/paths';

/** Files read at the same time when the index is filled. */
const READ_BATCH = 32;
/** Longest text of a matching line shown in a result. */
const MAX_LINE = 160;

export interface SearchHit {
    entry: FileEntry;
    /** The day the file belongs to, see {@link getJournalDate}. */
    date: Date;
    title: string;
    /** The first line (0-based) with a search word that is not in the title. */
    line?: number;
    text?: string;
}

interface Document {
    entry: FileEntry;
    date: Date;
    title: string;
    lowerTitle: string;
}

interface Content {
    mtime: number;
    lines: string[];
    lower: string;
}

/**
 * The smart search (#300): entries, weekly entries and notes of all journal
 * folders, found by name and text and sorted by the day they belong to,
 * newest first. The text of each file is read once and again only when the
 * file changed (its modification time).
 */
export class SearchIndex {

    private documents: Document[] = [];
    private readonly content = new Map<string, Content>();

    constructor(private readonly config: JournalSettings & JournalScopes & JournalPaths, private readonly fs: IFileSystem) { }

    /**
     * Replaces the files of the index with the scanned files. They are found by
     * name right away, by text after {@link readChanged}.
     */
    public setFiles(files: FileEntry[]): void {
        const journalFiles = files.filter(fe => fe.type !== undefined && fe.type !== JournalPageType.attachment);
        this.documents = journalFiles
            .map(entry => {
                const title = this.title(entry);
                return { entry, title, lowerTitle: title.toLowerCase(), date: getJournalDate(entry.path, entry.createdAt, entry.scope, this.config) };
            })
            .sort((a, b) => b.date.getTime() - a.date.getTime() || a.title.localeCompare(b.title));

        const known = new Set(journalFiles.map(fe => fe.path));
        for (const path of this.content.keys()) {
            if (!known.has(path)) { this.content.delete(path); }
        }
    }

    /** Reads the text of new and changed files (by their modification time). */
    public async readChanged(): Promise<void> {
        const stale = this.documents.map(doc => doc.entry).filter(fe => this.content.get(fe.path)?.mtime !== fe.updateAt);
        for (let i = 0; i < stale.length; i += READ_BATCH) {
            await Promise.all(stale.slice(i, i + READ_BATCH).map(fe => this.read(fe)));
        }
    }

    /**
     * The files that contain every word of the query in their name or text,
     * newest first. `#name` of a scope limits the search to that scope; other
     * words with `#` (tags) are searched as text. An empty query lists the
     * newest files.
     */
    public search(query: string, limit = 100): SearchHit[] {
        const { words, scopes } = this.parseQuery(query);
        const hits: SearchHit[] = [];
        for (const doc of this.documents) {
            if (hits.length >= limit) { break; }
            if (scopes.length > 0 && !scopes.includes((doc.entry.scope ?? SCOPE_DEFAULT).toLowerCase())) { continue; }

            const content = this.content.get(doc.entry.path);
            if (!words.every(word => doc.lowerTitle.includes(word) || content?.lower.includes(word))) { continue; }

            const hit: SearchHit = { entry: doc.entry, date: doc.date, title: doc.title };
            const inText = words.filter(word => !doc.lowerTitle.includes(word));
            if (content && inText.length > 0) {
                const line = content.lines.findIndex(text => inText.some(word => text.toLowerCase().includes(word)));
                if (line >= 0) {
                    hit.line = line;
                    hit.text = content.lines[line].trim().slice(0, MAX_LINE);
                }
            }
            hits.push(hit);
        }
        return hits;
    }

    /** Lower case words of the query; `#scope` for known scopes as filter. */
    private parseQuery(query: string): { words: string[]; scopes: string[] } {
        const known = new Set(this.config.getScopes().map(scope => scope.toLowerCase()));
        const words: string[] = [];
        const scopes: string[] = [];
        for (const token of query.toLowerCase().split(/\s+/).filter(Boolean)) {
            if (token.startsWith('#') && known.has(token.slice(1))) {
                scopes.push(token.slice(1));
            } else {
                words.push(token);
            }
        }
        return { words, scopes };
    }

    private title(entry: FileEntry): string {
        return entry.type === JournalPageType.note ? denormalizeFilename(entry.name) : Path.parse(entry.name).name;
    }

    private async read(entry: FileEntry): Promise<void> {
        try {
            const text = new TextDecoder().decode(await this.fs.readFile(entry.path));
            this.content.set(entry.path, { mtime: entry.updateAt, lines: text.split(/\r?\n/), lower: text.toLowerCase() });
        } catch {
            // unreadable files are found by name only
            this.content.delete(entry.path);
        }
    }
}
