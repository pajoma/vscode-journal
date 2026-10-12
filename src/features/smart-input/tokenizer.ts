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
//

'use strict';

import { ParseConfidence } from '../../shared/model/input';
import { matchMonth, matchWeekday, SHORTCUTS } from './vocabulary';

type PlainType = 'flag' | 'shortcut' | 'offset' | 'iso' | 'weekNum' | 'week' | 'modifier' | 'dayOfMonth' | 'text';

/** A recognized part of the input; weekday and month words carry the number they stand for. */
export type Token =
    | { [K in PlainType]: { type: K; value: string } }[PlainType]
    | { type: 'weekday'; value: string; isoDay: number }
    | { type: 'month'; value: string; month: number };

export interface TokenizeResult { tokens: Token[]; confidence: ParseConfidence; }

/** What a recognizer found at a position: its tokens and where the match ends. */
interface Hit { tokens: Token[]; end: number; ambiguous?: boolean; }

type Recognizer = (input: string, pos: number, locale: string) => Hit | null;

const SHORTCUT = new RegExp(`^(${Object.keys(SHORTCUTS).join('|')})(?=\\s|$)`, 'i');

function skipWs(input: string, pos: number): number {
    while (pos < input.length && /\s/.test(input[pos])) { pos++; }
    return pos;
}

/** One plain token for a match of `re` at pos; the value is group 1 if present, lower-cased. */
function plain(type: PlainType, re: RegExp): (input: string, pos: number) => Hit | null {
    return (input, pos) => {
        const m = input.slice(pos).match(re);
        if (!m) { return null; }
        return { tokens: [{ type, value: (m[1] ?? m[0]).toLowerCase() }], end: pos + m[0].length };
    };
}

/** Two recognizers in a row; only both together count (a lone modifier or month stays text). */
function sequence(first: Recognizer, then: Recognizer): Recognizer {
    return (input, pos, locale) => {
        const a = first(input, pos, locale);
        const b = a && then(input, skipWs(input, a.end), locale);
        return a && b ? { tokens: [...a.tokens, ...b.tokens], end: b.end, ambiguous: a.ambiguous || b.ambiguous } : null;
    };
}

function anyOf(...recognizers: Recognizer[]): Recognizer {
    return (input, pos, locale) => {
        for (const recognize of recognizers) {
            const hit = recognize(input, pos, locale);
            if (hit) { return hit; }
        }
        return null;
    };
}

const recognizeFlag = plain('flag', /^(task|todo)(?=\s|$)/i);
const recognizeShortcut = plain('shortcut', SHORTCUT);
const recognizeOffset = plain('offset', /^([+-]\d+)(?=\s|$)/);
const recognizeWeekNum = plain('weekNum', /^w(?:eek)?\s?(\d{1,2})(?=\s|$)/i);
const recognizeWeek = plain('week', /^w(?:eek)?(?=\s|$)/i);
const recognizeModifier = plain('modifier', /^(next|last|n|l)(?=\s|$)/i);
const recognizeDate = plain('iso', /^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|\d{1,2}[-\/]\d{1,2})(?=\s|$)/);

/** A day of the month, 1 to 31; any other number ("45 Minuten") is text. */
function day(type: 'iso' | 'dayOfMonth'): Recognizer {
    const recognize = plain(type, /^(\d{1,2})(?=\s|$)/);
    return (input, pos) => {
        const hit = recognize(input, pos);
        const value = hit ? parseInt(hit.tokens[0].value) : 0;
        return value >= 1 && value <= 31 ? hit : null;
    };
}

const recognizeISO = anyOf(recognizeDate, day('iso'));
const recognizeDayOfMonth = day('dayOfMonth');

function recognizeWeekday(input: string, pos: number, locale: string): Hit | null {
    const m = matchWeekday(input.slice(pos), locale);
    if (!m) { return null; }
    return { tokens: [{ type: 'weekday', value: m.text.toLowerCase(), isoDay: m.value }], end: pos + m.text.length, ambiguous: m.text.length <= 3 };
}

function recognizeMonth(input: string, pos: number, locale: string): Hit | null {
    const m = matchMonth(input.slice(pos), locale);
    if (!m) { return null; }
    return { tokens: [{ type: 'month', value: m.text.toLowerCase(), month: m.value }], end: pos + m.text.length };
}

/**
 * The temporal expressions, first match wins. The order matters: "w23"
 * before "w", "next monday" before "monday", a plain number as ISO day
 * before month and day.
 */
const recognizeTemporal = anyOf(
    recognizeShortcut,
    recognizeOffset,
    recognizeWeekNum,
    sequence(recognizeModifier, anyOf(recognizeWeekday, recognizeWeekNum, recognizeWeek)),
    recognizeWeekday,
    recognizeISO,
    recognizeWeek,
    sequence(recognizeMonth, recognizeDayOfMonth),
);

/**
 * Splits smart input into an optional flag (task/todo), one temporal
 * expression, an optional flag after it, and the remaining text. Recognizes
 * only; what the tokens mean for a date is decided in date-resolver.ts.
 */
export function tokenize(input: string, locale: string): TokenizeResult {
    const tokens: Token[] = [];
    let pos = skipWs(input, 0);
    const take = (hit: Hit | null): Hit | null => {
        if (hit) {
            tokens.push(...hit.tokens);
            pos = skipWs(input, hit.end);
        }
        return hit;
    };

    take(recognizeFlag(input, pos));
    const temporal = take(recognizeTemporal(input, pos, locale));
    if (temporal) {
        take(recognizeFlag(input, pos));
    }
    if (pos < input.length) {
        tokens.push({ type: 'text', value: input.slice(pos).trim() });
    }

    const confidence: ParseConfidence = !temporal ? 'text-only' : temporal.ambiguous ? 'ambiguous' : 'resolved';
    return { tokens, confidence };
}
