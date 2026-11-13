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
import { IFileSystem } from '../../shared/model/index';

/**
 * Which task in Super Productivity a key of the journal stands for
 * (docs/specs/2026-11-13-scopes-keys-plans.md, decision 22): no ids in the
 * markdown, but `<journal base>/.vscode/superproductivity.json`, committed
 * with the journal, so other machines know the links. One entry per key,
 * sorted, so that git merges rarely conflict: `{ "#acme:12": "AbC123" }`.
 */
export class TaskMapping {

    private constructor(private readonly ids: Map<string, string>) { }

    /** The mapping of a file's text; empty for no text or an unreadable one. */
    public static parse(text?: string): TaskMapping {
        try {
            const json: unknown = text ? JSON.parse(text) : {};
            const entries = json !== null && typeof json === 'object' && !Array.isArray(json) ? Object.entries(json) : [];
            return new TaskMapping(new Map(entries.filter((e): e is [string, string] => typeof e[1] === 'string').map(([key, id]) => [key.toLowerCase(), id])));
        } catch {
            return new TaskMapping(new Map());
        }
    }

    /** The id of the task of the key (lower case, `#acme:12`); undefined if the key is not linked. */
    public get(key: string): string | undefined {
        return this.ids.get(key.toLowerCase());
    }

    public set(key: string, id: string): void {
        this.ids.set(key.toLowerCase(), id);
    }

    /** The ids of all linked tasks. */
    public taskIds(): Set<string> {
        return new Set(this.ids.values());
    }

    public get size(): number {
        return this.ids.size;
    }

    /**
     * The text of the file, one entry per line, in an order that is the same
     * on every machine: by scope (the default scope first), then by number.
     */
    public toString(): string {
        const parts = (key: string): [string, number] => {
            const m = /^(#[^:]*)?:(\d+)$/.exec(key);
            return m ? [m[1] ?? '', Number(m[2])] : [key, 0];
        };
        const order = ([a]: [string, string], [b]: [string, string]) => {
            const [sa, na] = parts(a);
            const [sb, nb] = parts(b);
            return sa < sb ? -1 : sa > sb ? 1 : na - nb;
        };
        return JSON.stringify(Object.fromEntries([...this.ids].sort(order)), null, 2) + '\n';
    }
}

/** Reads and writes the mapping of the journal at `<base>/.vscode/superproductivity.json`. */
export class MappingFile {

    constructor(private readonly fs: IFileSystem, private readonly base: () => string) { }

    public get path(): string {
        return Path.join(this.base(), '.vscode', 'superproductivity.json');
    }

    public async load(): Promise<TaskMapping> {
        try {
            return TaskMapping.parse(new TextDecoder().decode(await this.fs.readFile(this.path)));
        } catch {
            return TaskMapping.parse();
        }
    }

    public async save(mapping: TaskMapping): Promise<void> {
        await this.fs.createDirectory(Path.dirname(this.path));
        await this.fs.writeFile(this.path, new TextEncoder().encode(mapping.toString()));
    }
}
