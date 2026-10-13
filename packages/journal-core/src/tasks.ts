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
 * Checklist tasks as the journal writes them: open "[ ]", done "[x] … (done: …)",
 * moved "[>] … (moved: …)". The extension's code actions and the MCP server
 * both write and read them (#250).
 */

/** The checkbox of an open, a done and a moved task. */
export const TASK_BOX = { open: '[ ]', done: '[x]', moved: '[>]' } as const;

/** A task line: indent, bullet, mark (x, X, > or none; "[]" from older templates counts as open), text. */
export const CHECKBOX = /^(\s*)([-*+])\s?\[\s{0,2}(x|X|>)?\s{0,2}\]\s?(.*)$/;

/** moment format of the completion time in "(done: …)". */
export const DONE_TIME_FORMAT = 'YYYY-MM-DD HH:mm';

/** The "(done: …)" annotation anywhere in a line, also with text after it. */
export const DONE_ANNOTATION = /\s*\(done: [^)]*\)/;
export const MOVED_SUFFIX = /\s*\(moved: [^)]*\)\s*$/;

/** " (done: <time>)", appended to a completed task. */
export function doneSuffix(time: string): string {
    return ` (done: ${time})`;
}

/** The text without any "(done: …)" annotation, wherever it is. */
export function withoutDone(text: string): string {
    return text.replace(new RegExp(DONE_ANNOTATION.source, 'g'), '');
}

/** " (moved: <target>)", appended to a moved task. */
export function movedSuffix(target: string): string {
    return ` (moved: ${target})`;
}
