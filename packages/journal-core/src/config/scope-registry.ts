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


import * as Path from 'path';
import { Scope } from './scope';
import { IWorkspaceConfigReader, ScopeDefinition, SCOPE_DEFAULT } from './types';

/** Names of scope folders that are scopes; new scopes are created with a {@link SLUG}. */
export const SCOPE_NAME = /^[A-Za-z0-9_-]+$/;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The one place that decides what a scope is: a folder below the scope root
 * and/or an entry in `journal.scopes`. Rules:
 * - names are matched without case,
 * - the first `journal.scopes` entry with a name wins (later duplicates are ignored),
 * - a folder and a settings entry with the same name are one scope (the entry adds its templates),
 * - the folder of an entry without folder below the root is its `base`, else `<scopeRoot>/<name>`,
 * - `default` is no scope name; unknown names and the empty name resolve to the default scope.
 */
export class ScopeRegistry {

    private folders: string[] = [];

    constructor(
        private readonly config: IWorkspaceConfigReader,
        private readonly scopeRoot: () => string,
        /** Resolves the `base` of a settings entry to an absolute folder. */
        private readonly resolveFolder: (base: string) => string = base => base,
    ) { }

    /** Folder names below the scope root, as scanned by the scopes feature. */
    setFolders(names: string[]): void {
        this.folders = names.filter(name => SCOPE_NAME.test(name) && !same(name, SCOPE_DEFAULT));
    }

    private definitions(): ScopeDefinition[] {
        const raw = this.config.get<ScopeDefinition[]>('scopes');
        const result: ScopeDefinition[] = [];
        // the package default of journal.scopes was "{}" although an array is expected
        for (const definition of Array.isArray(raw) ? raw : []) {
            const name = definition?.name;
            if (typeof name === 'string' && name.length > 0 && !same(name, SCOPE_DEFAULT) && !result.some(d => same(d.name, name))) {
                result.push(definition);
            }
        }
        return result;
    }

    /** The default scope first, then configured scopes in settings order, then further folder scopes. */
    all(): Scope[] {
        const definitions = this.definitions();
        const folders = this.folders.filter(folder => !definitions.some(d => same(d.name, folder)));
        return [Scope.DEFAULT, ...definitions.map(d => this.create(d.name, d)), ...folders.map(folder => this.create(folder))];
    }

    get(name?: string): Scope {
        if (name === undefined || name === null || name.length === 0 || same(name, SCOPE_DEFAULT)) {
            return Scope.DEFAULT;
        }
        const definition = this.definitions().find(d => same(d.name, name));
        const folder = this.folders.find(f => same(f, name));
        return definition || folder ? this.create(definition?.name ?? folder!, definition) : Scope.DEFAULT;
    }

    private create(name: string, definition?: ScopeDefinition): Scope {
        const folder = this.folders.find(f => same(f, name));
        if (folder) {
            return new Scope(name, 'folder', definition, Path.join(this.scopeRoot(), folder));
        }
        const base = definition?.base;
        return new Scope(name, 'configured', definition, typeof base === 'string' && base.trim() ? this.resolveFolder(base) : Path.join(this.scopeRoot(), name));
    }
}
