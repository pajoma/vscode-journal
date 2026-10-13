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
    // dates first: a title is not a template
    let text = resolveDate(template, date, locale);
    text = replaceVariable(text, 'input', title.trim());
    return replaceVariable(text, 'tags', tagLine).trimEnd();
}

/**
 * Title and link of a file linked from an entry in `fromDir`: the title is the
 * file name without extension, "_" read as space, with "(.pdf) " in front for
 * files that are not journal files (`ext`); the link is the plain relative path
 * with "/" (not URL-encoded).
 */
export function fileLink(fromDir: string, file: string, ext: string): { title: string; link: string } {
    const { name, ext: fileExt } = path.parse(file);
    const title = name.replace(/_/g, ' ');
    return {
        title: fileExt.slice(1) === ext ? title : `(${fileExt}) ${title}`,
        link: path.relative(fromDir, file).split(path.sep).join('/'),
    };
}
