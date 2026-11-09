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

import { wikiLinkAt } from 'journal-core';
import { beforeRenderRule, MarkdownIt } from '../../shared/markdown/markdown-it';

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
        // the syntax of journal-core, as the editor and the MCP server read it
        const link = wikiLinkAt(src, pos);
        if (!link) { return false; }
        if (!silent) {
            const file = resolver.file(link.target);
            if (file) {
                const open = state.push('link_open', 'a', 1);
                open.attrs = [['href', resolver.href(file, state.env)], ['class', 'journal-wiki-link'], ['title', link.target]];
                open.meta = { journalWikiFile: file } satisfies WikiLinkMeta;
                state.push('text', '', 0).content = link.label ?? link.target;
                state.push('link_close', 'a', -1);
            } else {
                state.push('text', '', 0).content = src.slice(pos, pos + link.length);
            }
        }
        state.pos = pos + link.length;
        return true;
    });

    beforeRenderRule(it, 'link_open', (token, env) => {
        const file = (token.meta as WikiLinkMeta | null | undefined)?.journalWikiFile;
        if (file) {
            const href = resolver.href(file, env);
            token.attrSet('href', href);
            token.attrSet('data-href', href);
        }
        return undefined;
    });
    return md;
}
