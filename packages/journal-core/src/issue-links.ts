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

import { FENCE } from './placement';

/**
 * Issue links (#173): `journal.issueLinks` maps a prefix to the URL of an
 * issue, `${id}` is its number. `pida#23` links the issue 23 of the prefix
 * `pida` (written with or without `#`); a prefix that ends with `-` is
 * followed by the number directly (Jira: `XX-1234`). Prefixes match in any
 * case. Text in code spans, code blocks and URLs is no issue link. This
 * module only parses (no I/O).
 */

/** An issue link in a text. */
export interface IssueLink {
    /** The text as written, e.g. `pida#23`. */
    text: string;
    url: string;
    /** Position of the link in the text and its length. */
    index: number;
    length: number;
}

/** `journal.issueLinks`: prefix → URL with `${id}`. */
export type IssueLinkSettings = Readonly<Record<string, string>>;

/** Prefix and number, not inside a word: `xpida#23` and `pida#23a` are no links. */
const ISSUE = (prefixes: string) => new RegExp(`(?<![\\p{L}\\p{N}_])(${prefixes})(\\d+)(?![\\p{L}\\p{N}_])`, 'giu');
/** Code spans and URLs (bare and markdown link targets): no issue links in them. */
const NO_LINKS = /(`+)[^`]*?\1|\bhttps?:\/\/[^\s<>()[\]]+|\]\([^)\s]*\)/g;

/** The issue links in a text, in order. */
export function issueLinks(text: string, settings: IssueLinkSettings): IssueLink[] {
    const urls = new Map<string, string>();
    for (const [key, url] of Object.entries(settings)) {
        const name = key.trim();
        if (name === '' || typeof url !== 'string' || url.trim() === '') { continue; }
        urls.set((/[-#]$/.test(name) ? name : name + '#').toLowerCase(), url.trim());
    }
    if (urls.size === 0) { return []; }

    const excluded = excludedRanges(text);
    // the longest prefix first: `op#1` and `devop#1` are different issues
    const prefixes = [...urls.keys()].sort((a, b) => b.length - a.length).map(escapeRegex).join('|');
    const links: IssueLink[] = [];
    for (const m of text.matchAll(ISSUE(prefixes))) {
        const index = m.index!;
        if (excluded.some(([start, end]) => index < end && index + m[0].length > start)) { continue; }
        links.push({ text: m[0], url: issueUrl(urls.get(m[1].toLowerCase())!, m[2]), index, length: m[0].length });
    }
    return links;
}

/** The URL with the number for `${id}`; a URL without `${id}` gets the number appended. */
function issueUrl(template: string, id: string): string {
    return template.includes('${id}') ? template.split('${id}').join(id) : template + id;
}

/** Start and end of the code blocks, code spans and URLs in the text. */
function excludedRanges(text: string): [number, number][] {
    const ranges: [number, number][] = [];
    let offset = 0;
    let fence: number | undefined;
    for (const line of text.split('\n')) {
        if (FENCE.test(line)) {
            if (fence === undefined) { fence = offset; } else { ranges.push([fence, offset + line.length]); fence = undefined; }
        }
        offset += line.length + 1;
    }
    if (fence !== undefined) { ranges.push([fence, text.length]); }
    for (const m of text.matchAll(NO_LINKS)) { ranges.push([m.index!, m.index! + m[0].length]); }
    return ranges;
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
