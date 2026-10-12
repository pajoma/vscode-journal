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
import { IWorkspaceConfigReader, Scope, ScopeDefinition, SCOPE_DEFAULT } from '../model/index';

/** Scope names: used as tag (`#name`) and as folder name. */
export const SCOPE_NAME = /^[A-Za-z0-9_-]+$/;

/**
 * The one place that decides what a scope is: configured in `journal.scopes`
 * and/or a folder below the scope root. Rules:
 * - the first `journal.scopes` entry with a name wins (later duplicates are ignored),
 * - a folder and a settings entry with the same name are one scope (the entry overrides),
 * - unknown names and the empty name resolve to the default scope.
 */
export class ScopeRegistry {

    private folders: string[] = [];

    constructor(
        private readonly config: IWorkspaceConfigReader,
        private readonly scopeRoot: () => string,
    ) { }

    /** Folder names below the scope root, as scanned by the scopes feature. */
    setFolders(names: string[]): void {
        this.folders = names.filter(name => SCOPE_NAME.test(name));
    }

    private definitions(): Map<string, ScopeDefinition> {
        const raw = this.config.get<ScopeDefinition[]>('scopes');
        const result = new Map<string, ScopeDefinition>();
        // the package default of journal.scopes was "{}" although an array is expected
        for (const definition of Array.isArray(raw) ? raw : []) {
            const name = definition?.name;
            if (typeof name === 'string' && name.length > 0 && name !== SCOPE_DEFAULT && !result.has(name)) {
                result.set(name, definition);
            }
        }
        return result;
    }

    /** The default scope first, then configured scopes in settings order, then further folder scopes. */
    all(): Scope[] {
        const definitions = this.definitions();
        const names = [...definitions.keys(), ...this.folders.filter(name => !definitions.has(name))];
        return [Scope.DEFAULT, ...names.map(name => this.create(name, definitions.get(name)))];
    }

    get(name?: string): Scope {
        if (name === undefined || name === null || name.length === 0 || name === SCOPE_DEFAULT) {
            return Scope.DEFAULT;
        }
        const definition = this.definitions().get(name);
        return definition || this.folders.includes(name) ? this.create(name, definition) : Scope.DEFAULT;
    }

    private create(name: string, definition?: ScopeDefinition): Scope {
        return this.folders.includes(name)
            ? new Scope(name, 'folder', definition, Path.join(this.scopeRoot(), name))
            : new Scope(name, 'configured', definition);
    }
}
