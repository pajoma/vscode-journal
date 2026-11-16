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
 * The outline numbers of plan items (docs/specs/2026-11-13-scopes-keys-plans.md,
 * decision 26): `1.`, `1.1`, `1.1.1` at the start of an item's text, like a
 * table of contents of the plan file. A copy of an item in the journal names
 * its scope, its number and its plan, `#acme 1.1 story [[Plan]]`; its
 * sub-items keep their number and belong to it. So a plan follows the
 * journal without keys (task sync), by scope, plan and number.
 */

import { FENCE } from './placement';
import { scopeOf } from './refs';
import { CHECKBOX } from './tasks';
import { parseWikiTarget, wikiLinks } from './wikilinks';

/** The plan of an item, as its copies name it: the scope and the wiki link target of the plan file. */
export interface PlanRef {
    scope: string;
    target: string;
}

/** Where the number of an item is in its line, and the number without a trailing dot (`1`, `1.1`). */
export interface ItemNumber {
    index: number;
    length: number;
    number: string;
}

/** A tag or key the text starts with: the number follows it (`#acme 1.1 …`, `#acme:5 1.1 …`, `:7 1. …`). */
const LEADING_REF = /^(?:#[\w-]+(?::\d+)?|:\d+)\s+/;

/** An outline number: a top-level number has a dot (`1.`), so that `3 calls` is no number. */
const NUMBER = /^(\d+\.(?:\d+(?:\.\d+)*)?)(?=\s|$)/;

/** The number as written: `1.` at the top level, `1.1` below. */
export function formatOutline(number: string): string {
    return number.includes('.') ? number : `${number}.`;
}

/** The outline number of the task in the line, after a leading tag or key; undefined without one. */
export function itemNumber(line: string): ItemNumber | undefined {
    const box = CHECKBOX.exec(line);
    if (!box) { return undefined; }
    let index = line.length - box[4].length;
    const lead = LEADING_REF.exec(box[4]);
    if (lead) { index += lead[0].length; }
    const m = NUMBER.exec(line.slice(index));
    return m ? { index, length: m[1].length, number: m[1].replace(/\.$/, '') } : undefined;
}

/** The id of a numbered plan item, as plan and copies share it: `acme/plan#1.1`. */
export function numberedId(plan: PlanRef, number: string): string {
    return `${plan.scope}/${plan.target}#${number}`.toLowerCase();
}

/** The task lines outside of code blocks. */
function taskLines(lines: readonly string[]): number[] {
    let fenced = false;
    return lines.flatMap((text, i) => {
        if (FENCE.test(text)) { fenced = !fenced; return []; }
        return !fenced && CHECKBOX.test(text) ? [i] : [];
    });
}

/** Whether the plan numbers its items (any item has an outline number): only such plans are renumbered. */
export function isNumbered(lines: readonly string[]): boolean {
    return taskLines(lines).some(i => itemNumber(lines[i]) !== undefined);
}

/** The outline number of each task of a plan by its place: top-level items 1, 2, …, their sub-items 1.1, 1.2, …, through the file. */
export function outlineNumbers(lines: readonly string[]): Map<number, string> {
    const numbers = new Map<number, string>();
    const stack: { indent: number; count: number }[] = [];
    for (const i of taskLines(lines)) {
        const indent = /^\s*/.exec(lines[i])![0].replace(/\t/g, '    ').length;
        while (stack.length && stack[stack.length - 1].indent > indent) { stack.pop(); }
        if (stack.length && stack[stack.length - 1].indent === indent) {
            stack[stack.length - 1].count++;
        } else {
            stack.push({ indent, count: 1 });
        }
        numbers.set(i, stack.map(level => level.count).join('.'));
    }
    return numbers;
}

/**
 * The lines of a plan to change so that each item has its outline number,
 * and the numbers that changed (old → new), for the copies in the journal.
 */
export function renumberEdits(lines: readonly string[]): { edits: { line: number; text: string }[]; renamed: Map<string, string> } {
    const edits: { line: number; text: string }[] = [];
    const renamed = new Map<string, string>();
    for (const [line, number] of outlineNumbers(lines)) {
        const text = lines[line];
        const current = itemNumber(text);
        if (current?.number === number && text.substr(current.index, current.length) === formatOutline(number)) { continue; }
        if (current) {
            if (current.number !== number) { renamed.set(current.number, number); }
            edits.push({ line, text: text.slice(0, current.index) + formatOutline(number) + text.slice(current.index + current.length) });
        } else {
            const box = CHECKBOX.exec(text)!;
            let at = text.length - box[4].length;
            const lead = LEADING_REF.exec(box[4]);
            if (lead) { at += lead[0].length; }
            const rest = text.slice(at);
            edits.push({ line, text: text.slice(0, at) + formatOutline(number) + (rest.length ? ` ${rest}` : ' ') });
        }
    }
    return { edits, renamed };
}

/** The plan a copy links to: a wiki link that names no day or week. */
function planTarget(text: string): string | undefined {
    return wikiLinks(text).map(link => link.target).find(target => {
        const parsed = parseWikiTarget(target);
        return parsed.kind !== 'day' && parsed.kind !== 'week';
    });
}

/**
 * The numbered copies of plan items in an entry: a task with a scope, an
 * outline number and a link to its plan (`#acme 1.1 story [[Plan]]`), and
 * the numbered sub-tasks below it, which belong to the same plan.
 */
export function numberedCopies(lines: readonly string[], scopeName: (name: string) => string | undefined): { line: number; id: string; number: ItemNumber }[] {
    const copies: { line: number; id: string; number: ItemNumber }[] = [];
    const stack: { indent: number; plan?: PlanRef }[] = [];
    for (const i of taskLines(lines)) {
        const text = lines[i];
        const indent = /^\s*/.exec(text)![0].replace(/\t/g, '    ').length;
        while (stack.length && stack[stack.length - 1].indent >= indent) { stack.pop(); }
        const number = itemNumber(text);
        const scope = scopeOf(text, scopeName);
        const target = planTarget(text);
        // its own plan, else the plan of the task it is a sub-task of
        const plan = scope && target ? { scope, target } : stack[stack.length - 1]?.plan;
        stack.push({ indent, plan });
        if (number && plan) { copies.push({ line: i, id: numberedId(plan, number.number), number }); }
    }
    return copies;
}
