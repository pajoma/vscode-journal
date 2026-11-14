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
import { fileExists } from '../../shared/fs/fs-exists';
import { IFileSystem } from '../../shared/model/index';

/**
 * The mapping file exists but holds no mapping, e.g. after a git merge with
 * conflict markers: nothing is synced and nothing is written until it is
 * fixed, else every link would be lost and every task sent again.
 */
export class MappingUnreadableError extends Error {
    constructor(public readonly path: string, cause: unknown) {
        super(`The mapping ${path} cannot be read: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
}

/**
 * Which task in Super Productivity a key of the journal stands for
 * (docs/specs/2026-11-13-scopes-keys-plans.md, decision 22): no ids in the
 * markdown, but `<journal base>/.vscode/superproductivity.json`, committed
 * with the journal, so other machines know the links. One entry per key,
 * sorted, so that git merges rarely conflict: `{ "#acme:12": "AbC123" }`.
 */
export class TaskMapping {

    /** The links set since the mapping was read. */
    private readonly added = new Map<string, string>();

    private constructor(private readonly ids: Map<string, string>) { }

    /**
     * The mapping of a file's text; empty for no text.
     * @throws if the text is no JSON object
     */
    public static parse(text?: string): TaskMapping {
        const json: unknown = text?.trim() ? JSON.parse(text) : {};
        if (json === null || typeof json !== 'object' || Array.isArray(json)) { throw new TypeError('not a JSON object'); }
        return new TaskMapping(new Map(Object.entries(json).filter((e): e is [string, string] => typeof e[1] === 'string').map(([key, id]) => [key.toLowerCase(), id])));
    }

    /** The id of the task of the key (lower case, `#acme:12`); undefined if the key is not linked. */
    public get(key: string): string | undefined {
        return this.ids.get(key.toLowerCase());
    }

    public set(key: string, id: string): void {
        this.ids.set(key.toLowerCase(), id);
        this.added.set(key.toLowerCase(), id);
    }

    /** The links set since the mapping was read, to be saved. */
    public get changes(): ReadonlyMap<string, string> {
        return this.added;
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

    /** The saves, one after the other. */
    private writing: Promise<void> = Promise.resolve();

    constructor(private readonly fs: IFileSystem, private readonly base: () => string) { }

    public get path(): string {
        return Path.join(this.base(), '.vscode', 'superproductivity.json');
    }

    /**
     * The mapping in the file; empty if there is no file yet.
     * @throws {@link MappingUnreadableError} if the file cannot be read or holds no mapping
     */
    public async load(): Promise<TaskMapping> {
        const path = this.path;
        try {
            if (!(await fileExists(this.fs, path))) { return TaskMapping.parse(); }
            return TaskMapping.parse(new TextDecoder().decode(await this.fs.readFile(path)));
        } catch (error) {
            throw new MappingUnreadableError(path, error);
        }
    }

    /**
     * Adds the links set in `mapping` to the file, as it is now: links another
     * command saved meanwhile stay. Writes nothing if there are none.
     */
    public save(mapping: TaskMapping): Promise<void> {
        if (mapping.changes.size === 0) { return this.writing; }
        const changes = new Map(mapping.changes);
        const run = this.writing.then(async () => {
            const current = await this.load();
            changes.forEach((id, key) => current.set(key, id));
            await this.fs.createDirectory(Path.dirname(this.path));
            await this.fs.writeFile(this.path, new TextEncoder().encode(current.toString()));
        });
        this.writing = run.catch(() => undefined);
        return run;
    }
}
