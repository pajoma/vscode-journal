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
 * Where new memos, tasks and links go in an entry (#320): below the template's
 * `after` anchor, at the bottom of their kind (oldest first). The extension
 * and the MCP server both place lines with it.
 */

import { linkTargets } from './links';
import { CHECKBOX, inTaskBlock } from './tasks';
import { templatePattern } from './template';

/** A markdown heading: level marks, text. */
export const HEADING = /^(#{1,6})\s+(.*?)\s*$/;
/** The start or end of a fenced code block. */
export const FENCE = /^\s*(```|~~~)/;

export interface Heading {
    index: number;
    level: number;
    text: string;
}

/** The headings of the lines, outside code blocks. */
export function headings(lines: string[]): Heading[] {
    const result: Heading[] = [];
    let fenced = false;
    lines.forEach((line, index) => {
        if (FENCE.test(line)) { fenced = !fenced; }
        const m = fenced ? null : HEADING.exec(line);
        if (m) { result.push({ index, level: m[1].length, text: m[2] }); }
    });
    return result;
}

/** A checklist item with text (an empty "- [ ]" placeholder is not a task). */
export function isTask(line: string): boolean {
    const m = CHECKBOX.exec(line);
    return !!m && m[4].trim() !== '';
}

/** The kinds of lines that are kept together. */
export const LINE_KINDS = {
    /** A task and its sub-tasks. */
    task: inTaskBlock,
    /** A list item with a link that is not a task, e.g. a note link. */
    link: (line: string) => linkTargets(line).length > 0 && /^\s*[-*+]\s/.test(line) && !isTask(line),
    /** A line written with the `memo` template that is not a task. */
    memo: (memoTemplate: string) => {
        const pattern = templatePattern(memoTemplate);
        return (line: string) => pattern.test(line) && !isTask(line);
    },
};

/**
 * Inserts a line below the template's `after` anchor, or directly below the
 * title if it has none, and returns its index. Lines of the same kind are
 * kept together: a new one goes after the existing ones (oldest first). A
 * missing anchor heading is created below the title.
 */
export function placeLine(lines: string[], line: string, after: string, sameKind: (l: string) => boolean): number {
    const exact = after ? lines.findIndex((l) => l.trim() === after.trim()) : -1;
    const anchor = exact >= 0 || !after ? exact : lines.findIndex((l) => l.includes(after));

    if (after && anchor < 0 && after.trimStart().startsWith('#')) {
        // the anchor heading is missing: create it below the title
        const title = headings(lines).find((h) => h.level === 1);
        if (!title) {
            lines.splice(0, 0, after.trim(), line, '');
            return 1;
        }
        lines.splice(title.index + 1, 0, '', after.trim(), line);
        return title.index + 3;
    }

    const heading = anchor >= 0 ? HEADING.exec(lines[anchor]) : null;
    if (heading && heading[1].length > 1) {
        // section anchor: after the last line of the same kind in that section
        const level = heading[1].length;
        const next = headings(lines).find((h) => h.index > anchor && h.level <= level);
        let at = anchor + 1;
        for (let i = at; i < (next ? next.index : lines.length); i++) {
            if (sameKind(lines[i])) { at = i + 1; }
        }
        lines.splice(at, 0, line);
        return at;
    }

    // below the title (or a non-heading anchor), grouped with lines of the same kind
    const first = headings(lines)[0];
    const top = anchor >= 0 ? anchor : first?.level === 1 ? first.index : -1;
    let at = top + 1;
    while (at < lines.length && lines[at].trim() === '') { at++; }
    if (!sameKind(lines[at] ?? '')) { at = top + 1; }
    while (at < lines.length && sameKind(lines[at])) { at++; }
    lines.splice(at, 0, line);
    if (top >= 0 && at === top + 1) { lines.splice(at++, 0, ''); }
    if (lines[at + 1] !== undefined && lines[at + 1].trim() !== '' && !sameKind(lines[at + 1])) {
        lines.splice(at + 1, 0, '');
    }
    return at;
}
