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

import * as os from 'os';
import * as Path from 'path';
import { IFileSystem, JFileType } from '../model/index';
import { matchPathSegment, matchPathTemplate } from '../paths';

/**
 * The fixed folder a path template starts with (up to the first variable)
 * and the segments after it, with ${base} and ${homeDir} resolved.
 */
export function templateSegments(template: string, base: string): { root: string; segments: string[] } {
    const parts = Path.normalize(template.replace('${homeDir}', os.homedir()).replace('${base}', base)).split(Path.sep);
    const first = parts.findIndex(part => part.includes('${'));
    if (first < 0) { return { root: Path.dirname(parts.join(Path.sep)), segments: [Path.basename(parts.join(Path.sep))] }; }
    // join, not Path.join(...): that drops the leading empty segment of an absolute POSIX path
    return { root: parts.slice(0, first).join(Path.sep), segments: parts.slice(first) };
}

/**
 * All files whose path matches a path template such as
 * `${base}/${year}/${month}/${day}.${ext}` (#309): walks only the folders
 * that match the template's segments, from its fixed part. Hidden files and
 * folders are skipped, unreadable folders count as empty.
 */
export async function filesOfTemplate(fs: IFileSystem, template: string, base: string, ext: string): Promise<string[]> {
    const { root, segments } = templateSegments(template, base);
    const found: string[] = [];
    const walk = async (folder: string, rest: string[]): Promise<void> => {
        const [segment, ...below] = rest;
        const wanted = below.length === 0 ? JFileType.File : JFileType.Directory;
        let children: [string, JFileType][];
        try {
            children = await fs.readDirectory(folder);
        } catch {
            return;
        }
        for (const [name, type] of children) {
            if ((type & wanted) === 0 || name.startsWith('.') || !matchPathSegment(name, segment, ext)) { continue; }
            const path = Path.join(folder, name);
            if (below.length > 0) {
                await walk(path, below);
            } else if (matchPathTemplate(path, template, base, ext)) {
                found.push(path);
            }
        }
    };
    await walk(root, segments);
    return found.sort();
}

/** All files below the folders with one of the extensions (without dot), or every file without extensions; hidden files and folders are skipped. */
export async function filesBelow(fs: IFileSystem, folders: string[], extensions?: string[]): Promise<string[]> {
    const found = new Set<string>();
    const walk = async (folder: string): Promise<void> => {
        let children: [string, JFileType][];
        try {
            children = await fs.readDirectory(folder);
        } catch {
            return;
        }
        for (const [name, type] of children) {
            if (name.startsWith('.')) { continue; }
            const path = Path.join(folder, name);
            if ((type & JFileType.Directory) !== 0) {
                await walk(path);
            } else if (!extensions || extensions.includes(Path.extname(name).slice(1))) {
                found.add(path);
            }
        }
    };
    // a folder below another one is walked with it
    const roots = folders.map(folder => Path.normalize(folder))
        .filter((folder, i, all) => !all.some((other, j) => j !== i && (folder.startsWith(other + Path.sep) || (folder === other && j < i))));
    for (const root of roots) { await walk(root); }
    return [...found].sort();
}
