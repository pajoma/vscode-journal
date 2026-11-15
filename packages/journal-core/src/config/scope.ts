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


import { nonEmpty } from './strings';
import { InlineTemplate, LayoutDefinition, PatternDefinition, ScopeDefinition, SCOPE_DEFAULT } from './types';

/**
 * Where a scope comes from: the default journal, an entry in `journal.scopes`
 * (a folder elsewhere in the journal, or not created yet), or a folder below
 * `journal.scopeRoot` (which may additionally have a settings entry). Every
 * scope other than the default one is a slug and a folder.
 */
export type ScopeKind = 'default' | 'configured' | 'folder';

type PatternKind = keyof PatternDefinition;

/**
 * A scope (`#acme`, docs/specs/2026-11-13-scopes-keys-plans.md) as resolved
 * from the settings and the scope folders. Created by the ScopeRegistry only; every question about a
 * scope (patterns, templates, base, notes folder) is answered here.
 */
export class Scope {

    static readonly DEFAULT = new Scope(SCOPE_DEFAULT, 'default');

    constructor(
        readonly name: string,
        readonly kind: ScopeKind,
        /** The scope's entry in `journal.scopes`, if any; read through the getters below. */
        private readonly definition?: ScopeDefinition,
        /** Absolute folder of the scope; none for the default scope. See {@link notesFolder}. */
        private readonly folder?: string,
    ) { }

    get isDefault(): boolean {
        return this.kind === 'default';
    }

    /**
     * A pattern part of the scope: never, a scope has no date patterns (its
     * notes are flat in its folder); `patterns` of `journal.scopes` entries
     * are no longer read.
     */
    pattern(_kind: PatternKind, _part: 'path' | 'file'): string | undefined {
        return undefined;
    }

    /** The earlier layouts of the scope: none, see {@link pattern}. */
    get patternHistory(): LayoutDefinition[] {
        return [];
    }

    /** A template of the scope's settings entry; undefined if not set. */
    template(name: string): InlineTemplate | undefined {
        return this.definition?.templates?.find(tpl => tpl.name === name);
    }

    /** The raw `base` of the scope's settings entry; undefined if not set (the journal base applies). */
    get base(): string | undefined {
        return nonEmpty(this.definition?.base) ? this.definition!.base : undefined;
    }

    /** Folder holding the scope's notes, flat; undefined for the default scope. */
    get notesFolder(): string | undefined {
        return this.folder;
    }
}
