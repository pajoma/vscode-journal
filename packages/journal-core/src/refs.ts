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

/**
 * Scopes, keys and tags in the text of the journal, each with its own sign
 * (docs/specs/2026-11-13-scopes-keys-plans.md):
 * - `+acme`: the scope acme
 * - `+acme:12`: the key of item 12 in scope acme (implies `+acme`)
 * - `:12`: a key in the default scope
 * - `#label`: a tag, nothing else
 * All of them only as whole words: `10:30` holds no key, `C#` no tag. The
 * extension and the MCP server both read and write them.
 */

/** Slug of a new scope: lowercase, starting with a letter (`+1` is the day offset of the smart input). */
export const SLUG = /^[a-z][a-z0-9-]*$/;

/** `+name` and `+name:N`; the name as scope folders allow it, matched without case. */
const SCOPE_REF = /(^|\s)\+([A-Za-z][\w-]*)(?::(\d+))?(?=\s|$)/g;
/** `:N`, a key in the default scope. */
const DEFAULT_KEY = /(^|\s):(\d+)(?=\s|$)/g;
/** `#name`. */
const TAG = /(^|\s)#([\w-]+)(?=\s|$)/g;

/**
 * The scope a name stands for, for {@link scopeOf}, {@link keyOf} and the
 * like: as configured (case ignored); undefined for no scope.
 */
export function scopeNames(config: { getScope(name?: string): { name: string; isDefault: boolean } }): (name: string) => string | undefined {
    return name => {
        const scope = config.getScope(name);
        return scope.isDefault ? undefined : scope.name;
    };
}

/** The key of a task: its scope (undefined: the default scope) and its number. */
export interface TaskKey {
    scope?: string;
    number: number;
}

/** A `+name` or `+name:N` in a text: where it is, the name as written and the number of a key. */
export interface ScopeRef {
    index: number;
    length: number;
    name: string;
    number?: number;
}

/** The `+name` and `+name:N` of the text, in order. */
export function scopeRefs(text: string): ScopeRef[] {
    return [...text.matchAll(SCOPE_REF)].map(m => ({
        index: m.index! + m[1].length,
        length: m[0].length - m[1].length,
        name: m[2],
        number: m[3] === undefined ? undefined : Number(m[3]),
    }));
}

/** The tags of the text, without `#`, in order. */
export function tags(text: string): string[] {
    return [...text.matchAll(TAG)].map(m => m[2]);
}

/**
 * The first scope the text names (`+name` or a key `+name:N`), as `scopeName`
 * resolves it (the name of the scope, case as configured; undefined for no
 * scope); undefined if it names none.
 */
export function scopeOf(text: string, scopeName: (name: string) => string | undefined): string | undefined {
    for (const ref of scopeRefs(text)) {
        const scope = scopeName(ref.name);
        if (scope !== undefined) { return scope; }
    }
    return undefined;
}

/**
 * The key of the line: the first `+name:N` of a scope (`scopeName`, see
 * {@link scopeOf}) or `:N`; undefined if it has none.
 */
export function keyOf(line: string, scopeName: (name: string) => string | undefined): TaskKey | undefined {
    const scoped = scopeRefs(line).find(ref => ref.number !== undefined && scopeName(ref.name) !== undefined);
    const plain = new RegExp(DEFAULT_KEY.source).exec(line);
    if (scoped && (!plain || scoped.index < plain.index)) { return { scope: scopeName(scoped.name), number: scoped.number! }; }
    return plain ? { number: Number(plain[2]) } : undefined;
}

/** `+acme:12`, or `:12` in the default scope. */
export function formatKey(key: TaskKey): string {
    return `${key.scope ? '+' + key.scope : ''}:${key.number}`;
}

/** The highest key number in the texts per scope, by lower-case name; `''` for the default scope. */
export function highestKeys(texts: Iterable<string>): Map<string, number> {
    const highest = new Map<string, number>();
    const note = (scope: string, number: number) => highest.set(scope, Math.max(highest.get(scope) ?? 0, number));
    for (const text of texts) {
        for (const ref of scopeRefs(text)) {
            if (ref.number !== undefined) { note(ref.name.toLowerCase(), ref.number); }
        }
        for (const m of text.matchAll(DEFAULT_KEY)) { note('', Number(m[2])); }
    }
    return highest;
}

/** The next free key of the scope (undefined: the default scope): one above the highest in the texts. */
export function nextKey(texts: Iterable<string>, scope?: string): TaskKey {
    return { scope, number: (highestKeys(texts).get(scope?.toLowerCase() ?? '') ?? 0) + 1 };
}

/**
 * The text with the key: in place of the first bare `+name` of the key's
 * scope, else in front. A text that has a key already is returned as it is.
 */
export function withKey(text: string, key: TaskKey, scopeName: (name: string) => string | undefined): string {
    if (keyOf(text, scopeName)) { return text; }
    const ref = key.scope === undefined ? undefined
        : scopeRefs(text).find(r => r.number === undefined && scopeName(r.name)?.toLowerCase() === key.scope!.toLowerCase());
    if (!ref) { return `${formatKey(key)} ${text}`.trimEnd(); }
    return text.slice(0, ref.index) + formatKey(key) + text.slice(ref.index + ref.length);
}

/** The text without the first bare `+name` that names the scope `scope`, e.g. for the title of a note. */
export function withoutScope(text: string, scope: string, scopeName: (name: string) => string | undefined): string {
    const ref = scopeRefs(text).find(r => r.number === undefined && scopeName(r.name)?.toLowerCase() === scope.toLowerCase());
    if (!ref) { return text; }
    return (text.slice(0, ref.index) + text.slice(ref.index + ref.length)).replace(/\s{2,}/g, ' ').trim();
}
