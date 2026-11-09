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

import { IssueLink } from 'journal-core';
import { beforeRenderRule, CoreState, MarkdownIt, Token } from '../../shared/markdown/markdown-it';

/** Finds the issue links in a text and decides for which documents they are shown. */
export interface IssueLinkResolver {
    /** The issue links of a text, for the current settings; built once per parsed document. */
    matcher(): (text: string) => IssueLink[];
    /** True if the rendered document (`env.currentDocument`) shows issue links: a journal file. */
    shows(env: unknown): boolean;
}

/** Marks the link tokens of an issue link. */
interface IssueLinkMeta {
    journalIssueLink: true;
}

/**
 * Renders issue references such as `pida#23` as links in the markdown
 * preview (#173). It splits the text tokens after the inline parse, so code
 * spans and the text of existing links stay as they are. VS Code parses a
 * document without knowing it, so whether it is a journal file is decided
 * when rendering: elsewhere the reference stays text.
 */
export function issueLinkPlugin<T extends object>(md: T, resolver: IssueLinkResolver): T {
    const it = md as unknown as MarkdownIt;
    it.core.ruler.push('journal_issuelink', state => {
        const links = resolver.matcher();
        for (const block of state.tokens) {
            if (block.type !== 'inline' || !block.children) { continue; }
            // text inside a link (markdown, autolink, wiki link) is no second link
            let inLink = 0;
            block.children = block.children.flatMap(token => {
                if (token.type === 'link_open') { inLink++; }
                if (token.type === 'link_close') { inLink--; }
                return token.type === 'text' && inLink === 0 ? splitText(state, token, links(token.content)) : [token];
            });
        }
    });

    for (const rule of ['link_open', 'link_close']) {
        beforeRenderRule(it, rule, (token, env) =>
            (token.meta as IssueLinkMeta | null | undefined)?.journalIssueLink && !resolver.shows(env) ? '' : undefined);
    }
    return md;
}

/** The text token with its issue links as link tokens; the token itself if it has none. */
function splitText(state: CoreState, token: Token, links: IssueLink[]): Token[] {
    if (links.length === 0) { return [token]; }
    const tokens: Token[] = [];
    let pos = 0;
    for (const link of links) {
        if (link.index > pos) { tokens.push(text(state, token.content.slice(pos, link.index))); }
        const meta: IssueLinkMeta = { journalIssueLink: true };
        const open = new state.Token('link_open', 'a', 1);
        open.attrs = [['href', link.url], ['class', 'journal-issue-link'], ['title', link.url]];
        open.meta = meta;
        const close = new state.Token('link_close', 'a', -1);
        close.meta = meta;
        tokens.push(open, text(state, link.text), close);
        pos = link.index + link.length;
    }
    if (pos < token.content.length) { tokens.push(text(state, token.content.slice(pos))); }
    return tokens;
}

function text(state: CoreState, content: string): Token {
    const token = new state.Token('text', '', 0);
    token.content = content;
    return token;
}
