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

/** Width of a line's indentation; a tab counts as four spaces. */
function indentWidth(line: string): number {
    const indent = /^\s*/.exec(line)![0];
    return indent.replace(/\t/g, '    ').length;
}

/**
 * The lines that belong to the task at `index` (#172): the lines below it
 * that are indented deeper, i.e. its sub-tasks, their sub-tasks and any text
 * written under them. The block ends at the first line indented no deeper
 * than the task; a blank line belongs to it only if an indented line follows.
 * @returns the line indices, in order; empty if the task has no sub-tasks
 */
export function subtaskLines(lines: readonly string[], index: number): number[] {
    const depth = indentWidth(lines[index]);
    const block: number[] = [];
    for (let i = index + 1; i < lines.length; i++) {
        if (!lines[i].trim()) { continue; }
        if (indentWidth(lines[i]) <= depth) { break; }
        // blank lines between the task and this line belong to the block
        for (let j = (block.length ? block[block.length - 1] : index) + 1; j <= i; j++) { block.push(j); }
    }
    return block;
}

/**
 * The open sub-tasks of the task at `index`, at any depth (#172).
 * @param keep lines it may change; others (e.g. private lines) are left out
 */
export function openSubtasks(lines: readonly string[], index: number, keep: (i: number) => boolean = () => true): number[] {
    return subtaskLines(lines, index).filter((i) => {
        if (!keep(i)) { return false; }
        const m = CHECKBOX.exec(lines[i]);
        return m !== null && m[3] === undefined;
    });
}

/**
 * What goes along when the task at `index` is moved (#172): its open
 * sub-tasks and the text under it, without done and moved sub-tasks and the
 * lines below them, which stay where they were done.
 * @param keep lines it may move; the others and the lines below them stay, like done sub-tasks
 * @returns `lines`: the lines for the target, indented relative to the task;
 *          `open`: the indices of the open sub-tasks, to mark them moved
 */
export function subtasksToMove(lines: readonly string[], index: number, keep: (i: number) => boolean = () => true): { lines: string[]; open: number[] } {
    const parent = /^\s*/.exec(lines[index])![0];
    const result: { lines: string[]; open: number[] } = { lines: [], open: [] };
    let closedDepth: number | undefined;
    for (const i of subtaskLines(lines, index)) {
        const line = lines[i];
        if (closedDepth !== undefined) {
            if (!line.trim() || indentWidth(line) > closedDepth) { continue; }
            closedDepth = undefined;
        }
        const m = CHECKBOX.exec(line);
        if ((m && m[3] !== undefined) || !keep(i)) { closedDepth = indentWidth(line); continue; }
        if (m) { result.open.push(i); }
        result.lines.push(line.startsWith(parent) ? line.slice(parent.length) : line.trimStart());
    }
    return result;
}
