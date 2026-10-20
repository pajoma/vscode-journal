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

/** The parts of markdown-it the plugin uses (the instance comes from VS Code's markdown preview). */
interface MarkdownIt {
    inline: { ruler: { before(name: string, rule: string, fn: (state: InlineState, silent: boolean) => boolean): void } };
    renderer: { rules: Record<string, RenderRule | undefined> };
}
interface Token {
    attrs: [string, string][] | null;
    content: string;
    meta: unknown;
    attrSet(name: string, value: string): void;
}
interface InlineState {
    src: string;
    pos: number;
    env: unknown;
    push(type: string, tag: string, nesting: number): Token;
}
type RenderRule = (tokens: Token[], index: number, options: unknown, env: unknown, self: { renderToken(tokens: Token[], index: number, options: unknown): string }) => string;

/** Finds the file a wiki link names and builds the link to it. */
export interface WikiLinkResolver {
    /** The file the target names; undefined if it names none (or not one). */
    file(target: string): string | undefined;
    /**
     * The href of the file for the document being rendered. VS Code's preview
     * opens a link itself only if it has no scheme (a path relative to the
     * document); `env.currentDocument` is set when rendering, not when parsing.
     */
    href(file: string, env: unknown): string;
}

/** Marks a link token as a wiki link to this file. */
interface WikiLinkMeta {
    journalWikiFile: string;
}

/**
 * Renders `[[target]]` and `[[target|label]]` as links in the markdown
 * preview (#92). A target that names no file stays as it is written.
 *
 * VS Code parses a document once without knowing it (`env.currentDocument`
 * is undefined then) and renders the cached tokens with it. So the parse
 * stores the file on the token, and the link is built when rendering, as
 * `href` and as VS Code's `data-href` (which its own `link_open` rule copies
 * from `href`, before or after this one).
 */
export function wikiLinkPlugin<T extends object>(md: T, resolver: WikiLinkResolver): T {
    const it = md as unknown as MarkdownIt;
    it.inline.ruler.before('link', 'journal_wikilink', (state, silent) => {
        const { src, pos } = state;
        if (src.charCodeAt(pos) !== 0x5B || src.charCodeAt(pos + 1) !== 0x5B) { return false; }
        const end = src.indexOf(']]', pos + 2);
        if (end < 0) { return false; }
        const inner = src.slice(pos + 2, end);
        if (inner.trim() === '' || /[[\]\n]/.test(inner)) { return false; }
        if (!silent) {
            const bar = inner.indexOf('|');
            const target = (bar < 0 ? inner : inner.slice(0, bar)).trim();
            const label = bar < 0 ? '' : inner.slice(bar + 1).trim();
            const file = resolver.file(target);
            if (file) {
                const open = state.push('link_open', 'a', 1);
                open.attrs = [['href', resolver.href(file, state.env)], ['class', 'journal-wiki-link'], ['title', target]];
                open.meta = { journalWikiFile: file } satisfies WikiLinkMeta;
                state.push('text', '', 0).content = label || target;
                state.push('link_close', 'a', -1);
            } else {
                state.push('text', '', 0).content = `[[${inner}]]`;
            }
        }
        state.pos = end + 2;
        return true;
    });

    const previous = it.renderer.rules.link_open;
    it.renderer.rules.link_open = (tokens, index, options, env, self) => {
        const file = (tokens[index].meta as WikiLinkMeta | null | undefined)?.journalWikiFile;
        if (file) {
            const href = resolver.href(file, env);
            tokens[index].attrSet('href', href);
            tokens[index].attrSet('data-href', href);
        }
        return previous ? previous(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
    };
    return md;
}
