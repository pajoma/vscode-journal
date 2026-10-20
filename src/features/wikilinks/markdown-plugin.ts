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
}
interface InlineState {
    src: string;
    pos: number;
    env: unknown;
    push(type: string, tag: string, nesting: number): { attrs: [string, string][] | null; content: string; attrSet?(name: string, value: string): void };
}

/** The href of a wiki link target for the document being rendered (`env.currentDocument` in VS Code); undefined if it names no file. */
export type WikiHref = (target: string, env: unknown) => string | undefined;

/**
 * Renders `[[target]]` and `[[target|label]]` as links in the markdown
 * preview (#92). A target that names no file stays as it is written.
 */
export function wikiLinkPlugin<T extends object>(md: T, href: WikiHref): T {
    (md as unknown as MarkdownIt).inline.ruler.before('link', 'journal_wikilink', (state, silent) => {
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
            const link = href(target, state.env);
            if (link) {
                const open = state.push('link_open', 'a', 1);
                open.attrs = [['href', link], ['class', 'journal-wiki-link'], ['title', target]];
                state.push('text', '', 0).content = label || target;
                state.push('link_close', 'a', -1);
            } else {
                state.push('text', '', 0).content = `[[${inner}]]`;
            }
        }
        state.pos = end + 2;
        return true;
    });
    return md;
}
