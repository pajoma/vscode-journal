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

/**
 * The parts of markdown-it the preview plugins use (wiki links #92, issue
 * links #173). The instance comes from VS Code's markdown preview, so the
 * extension declares the types instead of depending on markdown-it's.
 */

export interface MarkdownIt {
    inline: { ruler: { before(name: string, rule: string, fn: (state: InlineState, silent: boolean) => boolean): void } };
    core: { ruler: { push(name: string, fn: (state: CoreState) => void): void } };
    renderer: { rules: Record<string, RenderRule | undefined> };
}

export interface Token {
    type: string;
    attrs: [string, string][] | null;
    content: string;
    meta: unknown;
    children: Token[] | null;
    attrSet(name: string, value: string): void;
}

export interface InlineState {
    src: string;
    pos: number;
    env: unknown;
    push(type: string, tag: string, nesting: number): Token;
}

export interface CoreState {
    tokens: Token[];
    Token: new (type: string, tag: string, nesting: number) => Token;
}

export type RenderRule = (tokens: Token[], index: number, options: unknown, env: unknown, self: { renderToken(tokens: Token[], index: number, options: unknown): string }) => string;

/**
 * Runs `before` ahead of the render rule (and the rules other plugins set
 * before): its text replaces the rendered token; undefined renders it as
 * before, with the changes `before` made to the token.
 */
export function beforeRenderRule(md: MarkdownIt, rule: string, before: (token: Token, env: unknown) => string | undefined): void {
    const previous = md.renderer.rules[rule];
    md.renderer.rules[rule] = (tokens, index, options, env, self) =>
        before(tokens[index], env) ?? (previous ? previous(tokens, index, options, env, self) : self.renderToken(tokens, index, options));
}
