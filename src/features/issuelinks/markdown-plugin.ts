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

/** The parts of markdown-it the plugin uses (the instance comes from VS Code's markdown preview). */
interface MarkdownIt {
    core: { ruler: { push(name: string, fn: (state: CoreState) => void): void } };
    renderer: { rules: Record<string, RenderRule | undefined> };
}
interface Token {
    type: string;
    attrs: [string, string][] | null;
    content: string;
    meta: unknown;
    children: Token[] | null;
}
interface CoreState {
    tokens: Token[];
    Token: new (type: string, tag: string, nesting: number) => Token;
}
type RenderRule = (tokens: Token[], index: number, options: unknown, env: unknown, self: { renderToken(tokens: Token[], index: number, options: unknown): string }) => string;

/** Finds the issue links in a text and decides for which documents they are shown. */
export interface IssueLinkResolver {
    links(text: string): IssueLink[];
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
        for (const block of state.tokens) {
            if (block.type !== 'inline' || !block.children) { continue; }
            const children: Token[] = [];
            let inLink = 0;
            for (const token of block.children) {
                if (token.type === 'link_open') { inLink++; }
                if (token.type === 'link_close') { inLink--; }
                const links = token.type === 'text' && inLink === 0 ? resolver.links(token.content) : [];
                if (links.length === 0) { children.push(token); continue; }
                let pos = 0;
                for (const link of links) {
                    if (link.index > pos) { children.push(text(state, token.content.slice(pos, link.index))); }
                    const open = new state.Token('link_open', 'a', 1);
                    open.attrs = [['href', link.url], ['class', 'journal-issue-link'], ['title', link.url]];
                    open.meta = { journalIssueLink: true } satisfies IssueLinkMeta;
                    const close = new state.Token('link_close', 'a', -1);
                    close.meta = open.meta;
                    children.push(open, text(state, link.text), close);
                    pos = link.index + link.length;
                }
                if (pos < token.content.length) { children.push(text(state, token.content.slice(pos))); }
            }
            block.children = children;
        }
    });

    for (const rule of ['link_open', 'link_close']) {
        const previous = it.renderer.rules[rule];
        it.renderer.rules[rule] = (tokens, index, options, env, self) => {
            if ((tokens[index].meta as IssueLinkMeta | null | undefined)?.journalIssueLink && !resolver.shows(env)) { return ''; }
            return previous ? previous(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
        };
    }
    return md;
}

function text(state: CoreState, content: string): Token {
    const token = new state.Token('text', '', 0);
    token.content = content;
    return token;
}
