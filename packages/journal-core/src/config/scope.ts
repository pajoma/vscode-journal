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


import { InlineTemplate, PatternDefinition, ScopeDefinition, SCOPE_DEFAULT } from './types';

/**
 * Where a scope comes from: the default journal, an entry in `journal.scopes`,
 * or a folder below `journal.scopeRoot` (which may additionally have a settings entry).
 */
export type ScopeKind = 'default' | 'configured' | 'folder';

type PatternKind = keyof PatternDefinition;

function nonEmpty(value: string | undefined): value is string {
    return value !== undefined && value !== null && value.length > 0;
}

/**
 * A scope (tag such as `#clientA`) as resolved from the settings and the
 * scope folders. Created by the ScopeRegistry only; every question about a
 * scope (patterns, templates, base, notes folder) is answered here.
 */
export class Scope {

    static readonly DEFAULT = new Scope(SCOPE_DEFAULT, 'default');

    constructor(
        readonly name: string,
        readonly kind: ScopeKind,
        /** The scope's entry in `journal.scopes`, if any; read through the getters below. */
        private readonly definition?: ScopeDefinition,
        /** Absolute folder of a folder scope; see {@link notesFolder}. */
        private readonly folder?: string,
    ) { }

    get isDefault(): boolean {
        return this.kind === 'default';
    }

    /** A pattern part set in the scope's settings entry; undefined if not set. */
    pattern(kind: PatternKind, part: 'path' | 'file'): string | undefined {
        const value = this.definition?.patterns?.[kind]?.[part];
        return nonEmpty(value) ? value : undefined;
    }

    /** A template of the scope's settings entry; undefined if not set. */
    template(name: string): InlineTemplate | undefined {
        return this.definition?.templates?.find(tpl => tpl.name === name);
    }

    /** The raw `base` of the scope's settings entry; undefined if not set (the journal base applies). */
    get base(): string | undefined {
        return nonEmpty(this.definition?.base) ? this.definition!.base : undefined;
    }

    /** Folder holding the scope's notes: a folder scope without its own notes path. */
    get notesFolder(): string | undefined {
        return this.kind === 'folder' && !this.pattern('notes', 'path') ? this.folder : undefined;
    }
}
