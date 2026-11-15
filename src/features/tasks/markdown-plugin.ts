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

import { taskState, TaskState } from 'journal-core';
import { beforeRenderRule, MarkdownIt } from '../../shared/markdown/markdown-it';

/** The box of a task at the start of a list item: "[ ]", "[x]", "[/]", "[>]" (as journal-core's CHECKBOX reads it). */
const BOX = /^\[\s{0,2}(x|X|>|\/)?\s{0,2}\]\s?/;

/** Marks the box token and the list item of a task. */
interface TaskMeta {
    journalTask: TaskState;
}

const TITLES: Record<TaskState, string> = { open: 'Open', done: 'Done', progress: 'In progress', moved: 'Moved' };

/**
 * Renders the tasks of journal files as tasks in the markdown preview: the
 * box of a list item ("- [ ] …", "[x]", "[/]", "[>]") as a box showing its
 * state, styled by res/preview/tasks.css. VS Code parses a document without
 * knowing it, so whether it is a journal file is decided when rendering
 * (`shows`): elsewhere the box stays text.
 */
export function taskPlugin<T extends object>(md: T, shows: (env: unknown) => boolean): T {
    const it = md as unknown as MarkdownIt;
    it.core.ruler.push('journal_task', state => {
        const tokens = state.tokens;
        for (let i = 2; i < tokens.length; i++) {
            const inline = tokens[i];
            if (inline.type !== 'inline' || tokens[i - 1].type !== 'paragraph_open' || tokens[i - 2].type !== 'list_item_open') { continue; }
            const first = inline.children?.[0];
            const box = first?.type === 'text' ? BOX.exec(first.content) : null;
            if (!first || !box) { continue; }
            const meta: TaskMeta = { journalTask: taskState(box[1]) };
            const token = new state.Token('journal_task', '', 0);
            token.content = box[0];
            token.meta = meta;
            first.content = first.content.slice(box[0].length);
            inline.children!.unshift(token);
            tokens[i - 2].meta = meta;
        }
    });

    it.renderer.rules.journal_task = (tokens, index, _options, env) => {
        const token = tokens[index];
        const task = (token.meta as TaskMeta).journalTask;
        return shows(env)
            ? `<span class="journal-task-box journal-task-${task}" title="${TITLES[task]}" aria-label="${TITLES[task]}"></span>`
            : escapeHtml(token.content);
    };
    beforeRenderRule(it, 'list_item_open', (token, env) => {
        const task = (token.meta as Partial<TaskMeta> | null | undefined)?.journalTask;
        if (task && shows(env)) {
            // added to the classes others set (VS Code: code-line), once: a parsed document is rendered again
            const classes = new Set((token.attrs?.find(([name]) => name === 'class')?.[1] ?? '').split(' ').filter(Boolean));
            classes.add('journal-task-item').add(`journal-task-${task}`);
            token.attrSet('class', [...classes].join(' '));
        }
        return undefined;
    });
    return md;
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
