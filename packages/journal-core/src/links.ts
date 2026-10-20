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

import * as path from 'path';
import { replaceVariable, resolveDate } from './template';

/**
 * Notes and links to files as the journal writes them: the extension and the
 * MCP server both create notes and link files from entries (#250).
 */

/** The header of a new note from the `note` template: date variables of `date`, `${input}` = title, `${tags}` = "#a #b". */
export function renderNoteHeader(template: string, title: string, tags: string[], date: Date, locale: string): string {
    const tagLine = tags
        .map(t => `#${t.trim().replace(/^#/, '')}`)
        .filter(t => t.length > 1)
        .join(' ');
    // the title last: it is not a template
    let text = resolveDate(template, date, locale);
    text = replaceVariable(text, 'tags', tagLine);
    return replaceVariable(text, 'input', title.trim()).trimEnd();
}

/**
 * Title and link of a file linked from an entry in `fromDir`: the title is the
 * file name without extension, "_" read as space, with "(.pdf) " in front for
 * files that are not journal files (`ext`); the link is the plain relative path
 * with "/" (not URL-encoded). Known limit: markdown reads a link with spaces or
 * unbalanced parentheses only inside "<…>", which is not written; new notes
 * have no spaces in their names (normalizeFilename).
 */
export function fileLink(fromDir: string, file: string, ext: string): { title: string; link: string } {
    const { name, ext: fileExt } = path.parse(file);
    const title = name.replace(/_/g, ' ');
    return {
        title: fileExt.slice(1) === ext ? title : `(${fileExt}) ${title}`,
        link: path.relative(fromDir, file).split(path.sep).join('/'),
    };
}

/** A markdown link target: balanced parentheses belong to it (links are not URL-encoded), "<…>" is unwrapped. */
const LINK_TARGET = /\]\(<?((?:[^()<>\n]|\([^()\n]*\))*)>?\)/g;

/**
 * The targets of the markdown links in a text, with "\" as "/" and decoded
 * (earlier MCP server versions URL-encoded them): how the extension and the
 * MCP server recognise an existing link, the counterpart of fileLink.
 */
export function linkTargets(text: string): string[] {
    return [...text.matchAll(LINK_TARGET)].map(m => readTarget(m[1]));
}

/**
 * Replaces the targets of the markdown links in a text (#309: files moved to
 * another layout). `replace` gets each target as {@link linkTargets} reads it
 * and returns the new one, or undefined to keep the link as it is; a target
 * in "<…>" stays in "<…>".
 */
export function replaceLinkTargets(text: string, replace: (target: string) => string | undefined): string {
    return text.replace(LINK_TARGET, (link: string, raw: string) => {
        const target = readTarget(raw);
        const next = replace(target);
        if (next === undefined || next === target) { return link; }
        return link.startsWith('](<') ? `](<${next}>)` : `](${next})`;
    });
}

/** A link target with "\" as "/" and decoded. */
function readTarget(raw: string): string {
    const target = raw.trim().replace(/\\/g, '/');
    try {
        return decodeURI(target);
    } catch {
        return target; // not encoded, e.g. a "%" in the file name
    }
}
