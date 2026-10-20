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
import MiniSearch, { SearchResult } from 'minisearch';
import { JournalPaths, JournalScopes, JournalSettings } from 'journal-core';
import { denormalizeFilename } from '../../shared/index';
import { FileEntry, JournalPageType, SCOPE_DEFAULT, SEARCH_DEFAULTS, SearchSettings } from '../../shared/model/index';
import { getJournalDate } from '../../shared/paths';
import { PageTexts } from '../../shared/journal/page-texts';

/** Files read at the same time when the index is filled. */
const READ_BATCH = 32;
/** Longest text of a matching line shown in a result. */
const MAX_LINE = 160;
const DAY_MS = 24 * 3600 * 1000;

export interface SearchHit {
    entry: FileEntry;
    /** The day the file belongs to, see {@link getJournalDate}. */
    date: Date;
    title: string;
    /** The first line (0-based) with a matched word that is not in the title. */
    line?: number;
    text?: string;
}

interface Document {
    entry: FileEntry;
    date: Date;
    title: string;
}

/** Lower case, without accents: "Müller" finds "muller" and the other way round. */
function normalize(text: string): string {
    return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * The smart search (#300): entries, weekly entries and notes of all journal
 * folders, found by title and text with MiniSearch (full-text index with
 * prefix and typo-tolerant matching, BM25 ranking). The texts come from the
 * journal's one text cache (#320): read once and again only when a file
 * changed (its modification time).
 */
export class SearchIndex {

    /** By path. */
    private documents = new Map<string, Document>();
    /** Newest first, for an empty query. */
    private byDate: Document[] = [];
    /** The modification time of the text in the index, by path. */
    private readonly indexed = new Map<string, number>();
    private readonly index = new MiniSearch<{ id: string; title: string; text: string }>({
        fields: ['title', 'text'],
        processTerm: term => normalize(term),
        // cleaned up after reading (readChanged): the automatic clean-up runs
        // in the background and fails when documents are replaced meanwhile
        autoVacuum: false,
        searchOptions: {
            boost: { title: 3 },
            combineWith: 'AND',
            // "kick" finds "kickoff"; "kickof" and "meetnig" are found despite the typo
            prefix: term => term.length >= 3,
            fuzzy: term => term.length >= 5 ? 0.2 : false,
        },
    });

    constructor(
        private readonly config: JournalSettings & JournalScopes & JournalPaths,
        private readonly texts: PageTexts,
        /** Read on every call, so changed settings apply right away. */
        private readonly settings: () => SearchSettings = () => SEARCH_DEFAULTS,
    ) { }

    /**
     * Replaces the files of the index with the scanned files. They are found by
     * title right away, by text after {@link readChanged}.
     */
    public setFiles(files: FileEntry[]): void {
        const journalFiles = files.filter(fe => fe.type !== undefined && fe.type !== JournalPageType.attachment);
        const known = new Set(journalFiles.map(fe => fe.path));
        for (const path of this.documents.keys()) {
            if (!known.has(path)) {
                this.index.discard(path);
                this.documents.delete(path);
                this.indexed.delete(path);
            }
        }

        for (const entry of journalFiles) {
            const doc = { entry, title: this.title(entry), date: new Date(entry.journalDate) };
            this.documents.set(entry.path, doc);
            if (!this.index.has(entry.path)) {
                this.index.add({ id: entry.path, title: doc.title, text: '' });
            }
        }
        this.byDate = [...this.documents.values()]
            .sort((a, b) => b.date.getTime() - a.date.getTime() || a.title.localeCompare(b.title));
    }

    /**
     * Reads the text of new and changed files (by their modification time) into
     * the index; with `journal.search.content` off, drops the text read before.
     */
    public async readChanged(): Promise<void> {
        if (!this.settings().content) {
            for (const path of this.indexed.keys()) {
                const doc = this.documents.get(path);
                if (doc) { this.index.replace({ id: path, title: doc.title, text: '' }); }
            }
            this.indexed.clear();
            if (this.index.dirtCount > 0) { await this.index.vacuum(); }
            return;
        }
        const stale = this.byDate.map(doc => doc.entry).filter(fe => this.indexed.get(fe.path) !== fe.updateAt);
        for (let i = 0; i < stale.length; i += READ_BATCH) {
            await Promise.all(stale.slice(i, i + READ_BATCH).map(fe => this.read(fe)));
        }
        // removes replaced and deleted documents from the index
        if (this.index.dirtCount > 0) { await this.index.vacuum(); }
    }

    /**
     * The files matching every word of the query in their title or text: by
     * relevance, recent files ranked higher. `#name` of a scope limits the
     * search to that scope; other words with `#` (tags) are searched as text.
     * An empty query lists the newest files.
     */
    public search(query: string, limit = this.settings().maxResults): SearchHit[] {
        const { words, scopes } = this.parseQuery(query);
        const inScope = (doc: Document) => scopes.length === 0 || scopes.includes((doc.entry.scope ?? SCOPE_DEFAULT).toLowerCase());

        if (words.length === 0) {
            return this.byDate.filter(inScope).slice(0, limit).map(doc => ({ entry: doc.entry, date: doc.date, title: doc.title }));
        }

        const now = Date.now();
        const weight = RECENCY_WEIGHT[this.settings().recency];
        return this.index.search(words.join(' '), { filter: result => inScope(this.documents.get(result.id)!) })
            .map(result => ({ result, doc: this.documents.get(result.id)!, }))
            .map(({ result, doc }) => ({ result, doc, score: result.score * recency(doc.date, now, weight) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(({ result, doc }) => this.hit(doc, result));
    }

    /** The hit with the first line that contains a matched word not in the title. */
    private hit(doc: Document, result: SearchResult): SearchHit {
        const hit: SearchHit = { entry: doc.entry, date: doc.date, title: doc.title };
        const inText = result.terms.filter(term => result.match[term]?.includes('text'));
        const lines = this.texts.peek(doc.entry.path)?.text.split(/\r?\n/);
        if (lines && inText.length > 0) {
            const line = lines.findIndex(text => {
                const normalized = normalize(text);
                return inText.some(term => normalized.includes(term));
            });
            if (line >= 0) {
                hit.line = line;
                hit.text = lines[line].trim().slice(0, MAX_LINE);
            }
        }
        return hit;
    }

    /** Words of the query; `#scope` for known scopes as filter. */
    private parseQuery(query: string): { words: string[]; scopes: string[] } {
        const known = new Set(this.config.getScopes().map(scope => scope.toLowerCase()));
        const words: string[] = [];
        const scopes: string[] = [];
        for (const token of query.split(/\s+/).filter(Boolean)) {
            if (token.startsWith('#') && known.has(token.slice(1).toLowerCase())) {
                scopes.push(token.slice(1).toLowerCase());
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
        const doc = this.documents.get(entry.path);
        if (!doc) { return; }
        // unreadable files are found by title only
        const text = (await this.texts.read(entry.path, entry.updateAt))?.text ?? '';
        this.indexed.set(entry.path, entry.updateAt);
        this.index.replace({ id: entry.path, title: doc.title, text });
    }
}

/**
 * Whether the index is built in the background after startup (#300): not when
 * the search is off or `journal.search.indexOnStartup` is `never`, and with
 * `local` (the default) not in remote sessions, where reading the whole journal
 * over the connection would slow down the window for a search that may never be used.
 */
export function buildsIndexOnStartup(settings: SearchSettings, remote: boolean): boolean {
    return settings.enabled && (settings.indexOnStartup === 'always' || (settings.indexOnStartup === 'local' && !remote));
}

/** `journal.search.recency`: the boost of a file of today; it halves after a year and fades for older files. */
const RECENCY_WEIGHT: Record<SearchSettings['recency'], number> = { off: 0, low: 0.5, default: 1, high: 3 };

/** With weight 1: 2 for today, 1.5 a year ago, towards 1 for old files. Relevance first, recent files win close calls. */
function recency(date: Date, now: number, weight: number): number {
    const ageDays = Math.max(0, (now - date.getTime()) / DAY_MS);
    return 1 + weight / (1 + ageDays / 365);
}
