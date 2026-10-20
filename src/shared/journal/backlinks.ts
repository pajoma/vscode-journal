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

import * as Path from 'path';
import { linkTargets, wikiLinks } from 'journal-core';
import { IFileSystem } from '../model/index';
import { JournalFiles } from './journal-files';
import { resolveWikiTarget } from './resolve';

/** The links of one page: markdown links as files, wiki links as targets (resolved when asked, notes come and go). */
interface PageLinks {
    mtime: number;
    files: Set<string>;
    wiki: string[];
}

/**
 * The pages (daily and weekly entries, notes) that link to a file (#311,
 * backlinks), by markdown link or wiki link. Each page is read once and again
 * only when its modification time changed.
 */
export class Backlinks {

    private readonly pages = new Map<string, PageLinks>();

    constructor(private readonly fs: IFileSystem) { }

    /** The pages linking to the file, in the order of the journal files (days, weeks, notes). */
    public async to(file: string, files: JournalFiles): Promise<string[]> {
        const target = Path.normalize(file);
        const pages = [...files.days.values(), ...files.weeks.values(), ...files.notes.map(note => note.path)];
        const known = new Set(pages.map(page => Path.normalize(page)));
        for (const page of this.pages.keys()) {
            if (!known.has(page)) { this.pages.delete(page); }
        }
        const linking: string[] = [];
        await Promise.all(pages.map(async page => {
            if (Path.normalize(page) === target) { return; }
            const links = await this.links(page);
            if (links && (links.files.has(target) || links.wiki.some(wiki => {
                const resolved = resolveWikiTarget(wiki, files);
                return resolved.kind === 'found' && Path.normalize(resolved.path) === target;
            }))) {
                linking.push(page);
            }
        }));
        return pages.filter(page => linking.includes(page));
    }

    /** The links of a page, read again if it changed; undefined if it cannot be read. */
    private async links(page: string): Promise<PageLinks | undefined> {
        const key = Path.normalize(page);
        let mtime: number;
        try {
            mtime = (await this.fs.stat(page)).mtime;
        } catch {
            this.pages.delete(key);
            return undefined;
        }
        const cached = this.pages.get(key);
        if (cached && cached.mtime === mtime) { return cached; }
        let text: string;
        try {
            text = new TextDecoder().decode(await this.fs.readFile(page));
        } catch {
            return undefined;
        }
        const dir = Path.dirname(page);
        const files = new Set(linkTargets(text)
            .filter(target => target !== '' && !target.startsWith('#') && !/^[a-z][a-z0-9+.-]+:/i.test(target))
            .map(target => Path.normalize(Path.resolve(dir, target.split('#')[0]))));
        const links: PageLinks = { mtime, files, wiki: wikiLinks(text).map(link => link.target) };
        this.pages.set(key, links);
        return links;
    }
}
