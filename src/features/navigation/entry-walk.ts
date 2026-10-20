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

import * as Path from 'path';
import { Layout } from 'journal-core';
import { templateSegments } from '../../shared/fs/template-walk';
import { IFileSystem, JFileType } from '../../shared/model/index';
import { entryTemplate, matchPathSegment, matchPathTemplate, PathVariable, validDate } from '../../shared/paths';

/** Step backward or forward from a day. */
export type Direction = 'previous' | 'next';

type Known = Partial<Record<PathVariable, number>>;

/**
 * The nearest existing daily entry of one layout before or after the day
 * (#309): walks the folders of the layout's entry pattern (e.g.
 * `${base}/${year}/${month}` + `${day}.${ext}`) from its fixed part, nearest
 * folders first, and skips folders that lie on the other side of the day.
 * Assumes the folders narrow the date down from year to day, as journal
 * patterns do. Unreadable folders count as empty.
 *
 * @returns the day of the entry, null if the layout has none in that direction
 */
export async function nearestEntry(fs: IFileSystem, layout: Layout, base: string, day: Date, direction: Direction): Promise<Date | null> {
    const template = entryTemplate(layout);
    const { root, segments } = templateSegments(template, base);
    const walk = new EntryWalk(fs, template, base, layout.ext, day, direction);
    return walk.find(root, segments, {});
}

class EntryWalk {

    private readonly day: number[];

    constructor(
        private readonly fs: IFileSystem,
        private readonly template: string,
        private readonly base: string,
        private readonly ext: string,
        day: Date,
        private readonly direction: Direction,
    ) {
        this.day = [day.getFullYear(), day.getMonth() + 1, day.getDate()];
    }

    /** The nearest entry below the folder, whose remaining path follows `segments`. */
    async find(folder: string, segments: string[], known: Known): Promise<Date | null> {
        const [segment, ...rest] = segments;
        const wanted = rest.length === 0 ? JFileType.File : JFileType.Directory;
        let children: [string, JFileType][];
        try {
            children = await this.fs.readDirectory(folder);
        } catch {
            return null;
        }

        const candidates = children
            .filter(([name, type]) => (type & wanted) !== 0 && !name.startsWith('.'))
            .map(([name]) => ({ name, match: matchPathSegment(name, segment, this.ext) }))
            .filter(child => child.match !== undefined)
            .map(child => ({ name: child.name, known: { ...known, ...child.match } }))
            .filter(child => !this.beyond(child.known))
            .sort((a, b) => this.nearestFirst(a.known, b.known));

        for (const child of candidates) {
            const path = Path.join(folder, child.name);
            const found = rest.length === 0 ? this.entryDay(path) : await this.find(path, rest, child.known);
            if (found) { return found; }
        }
        return null;
    }

    /** The day of an entry file on the right side of the day; null for the day itself, the other side or no real day. */
    private entryDay(path: string): Date | null {
        const match = matchPathTemplate(path, this.template, this.base, this.ext);
        const date = match && validDate(match.year, match.month, match.day);
        if (!date) { return null; }
        const order = compareKnown(parts(match), this.day);
        return (this.direction === 'previous' ? order < 0 : order > 0) ? date : null;
    }

    /** Whether the known part of a date (year, then month, then day) lies on the other side of the day. */
    private beyond(known: Known): boolean {
        const order = compareKnown(parts(known), this.day);
        return this.direction === 'previous' ? order > 0 : order < 0;
    }

    /** Sort order: the dates nearest to the day first, in the direction. */
    private nearestFirst(a: Known, b: Known): number {
        const order = compareForSort(parts(a), parts(b));
        return this.direction === 'previous' ? -order : order;
    }
}

/** Year, month and day as far as they are known in this order. */
function parts(known: Known): number[] {
    const result: number[] = [];
    for (const value of [known.year, known.month, known.day]) {
        if (value === undefined) { break; }
        result.push(value);
    }
    return result;
}

/**
 * Whether a partly known date lies before (-1) or after (1) a day: only the
 * parts known on both sides count, so a year is neither before nor after a
 * day in it (0). Used to skip folders on the other side of the day.
 */
function compareKnown(known: number[], day: number[]): number {
    return compareParts(known, day, Math.min(known.length, day.length));
}

/** The order of two partly known dates for sorting: a missing part sorts first. */
function compareForSort(a: number[], b: number[]): number {
    return compareParts(a, b, Math.max(a.length, b.length));
}

function compareParts(a: number[], b: number[], length: number): number {
    for (let i = 0; i < length; i++) {
        const difference = (a[i] ?? -1) - (b[i] ?? -1);
        if (difference !== 0) { return Math.sign(difference); }
    }
    return 0;
}
