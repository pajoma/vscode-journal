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

/**
 * Splits smart input into tokens: an optional flag (task/todo), one temporal
 * expression (shortcut, offset, ISO date, weekday, week, month and day), an
 * optional flag after it, and the remaining text. Recognizes only; what a
 * token means for a date is decided in date-resolver.ts.
 */

export type TokenType =
    | 'flag' | 'shortcut' | 'offset' | 'iso'
    | 'weekNum' | 'week' | 'modifier' | 'weekday'
    | 'month' | 'dayOfMonth' | 'text';

/** `number` is the weekday (ISO, 1 = Monday) or month (0 = January) the word stands for. */
export interface Token { type: TokenType; value: string; number?: number; }

export interface TokenizeResult { tokens: Token[]; confidence: ParseConfidence; }

interface RecognizerResult { token: Token; end: number; ambiguous?: boolean; }

const SHORTCUT = new RegExp(`^(${Object.keys(SHORTCUTS).join('|')})(?=\\s|$)`, 'i');

function skipWs(input: string, pos: number): number {
    while (pos < input.length && /\s/.test(input[pos])) { pos++; }
    return pos;
}

function recognizeFlag(input: string, pos: number): RecognizerResult | null {
    const m = input.slice(pos).match(/^(task|todo)(?=\s|$)/i);
    if (!m) { return null; }
    return { token: { type: 'flag', value: m[1].toLowerCase() }, end: pos + m[1].length };
}

function recognizeShortcut(input: string, pos: number): RecognizerResult | null {
    const m = input.slice(pos).match(SHORTCUT);
    if (!m) { return null; }
    return { token: { type: 'shortcut', value: m[1].toLowerCase() }, end: pos + m[1].length };
}

function recognizeOffset(input: string, pos: number): RecognizerResult | null {
    const m = input.slice(pos).match(/^([+-]\d+)(?=\s|$)/);
    if (!m) { return null; }
    return { token: { type: 'offset', value: m[1] }, end: pos + m[1].length };
}

function recognizeWeekNum(input: string, pos: number): RecognizerResult | null {
    const m = input.slice(pos).match(/^w(?:eek)?\s?(\d{1,2})(?=\s|$)/i);
    if (!m) { return null; }
    return { token: { type: 'weekNum', value: m[1] }, end: pos + m[0].length };
}

function recognizeWeek(input: string, pos: number): RecognizerResult | null {
    const m = input.slice(pos).match(/^w(?:eek)?(?=\s|$)/i);
    if (!m) { return null; }
    return { token: { type: 'week', value: m[0].toLowerCase() }, end: pos + m[0].length };
}

function recognizeModifier(input: string, pos: number): RecognizerResult | null {
    const m = input.slice(pos).match(/^(next|last|n|l)(?=\s|$)/i);
    if (!m) { return null; }
    return { token: { type: 'modifier', value: m[1].toLowerCase() }, end: pos + m[1].length };
}

function recognizeWeekday(input: string, pos: number, locale: string): RecognizerResult | null {
    const m = matchWeekday(input.slice(pos), locale);
    if (!m) { return null; }
    return { token: { type: 'weekday', value: m.text.toLowerCase(), number: m.value }, end: pos + m.text.length, ambiguous: m.text.length <= 3 };
}

function recognizeMonth(input: string, pos: number, locale: string): RecognizerResult | null {
    const m = matchMonth(input.slice(pos), locale);
    if (!m) { return null; }
    return { token: { type: 'month', value: m.text.toLowerCase(), number: m.value }, end: pos + m.text.length };
}

function recognizeDayOfMonth(input: string, pos: number): RecognizerResult | null {
    const m = input.slice(pos).match(/^(\d{1,2})(?=\s|$)/);
    if (!m) { return null; }
    const d = parseInt(m[1]);
    if (d < 1 || d > 31) { return null; }
    return { token: { type: 'dayOfMonth', value: m[1] }, end: pos + m[1].length };
}

function recognizeISO(input: string, pos: number): RecognizerResult | null {
    const sub = input.slice(pos);
    const full = sub.match(/^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})(?=\s|$)/);
    if (full) { return { token: { type: 'iso', value: full[1] }, end: pos + full[1].length }; }
    const md = sub.match(/^(\d{1,2}[-\/]\d{1,2})(?=\s|$)/);
    if (md) { return { token: { type: 'iso', value: md[1] }, end: pos + md[1].length }; }
    const d = sub.match(/^(\d{1,2})(?=\s|$)/);
    if (d) { return { token: { type: 'iso', value: d[1] }, end: pos + d[1].length }; }
    return null;
}


export function tokenize(inputString: string, locale: string): TokenizeResult {
    const tokens: Token[] = [];
    let pos = skipWs(inputString, 0);
    let hasTemporal = false;
    let ambiguous = false;

    // pre-flag
    const preFlagR = recognizeFlag(inputString, pos);
    if (preFlagR) { tokens.push(preFlagR.token); pos = skipWs(inputString, preFlagR.end); }

    // temporal token
    let temporal: RecognizerResult | null = null;

    temporal = recognizeShortcut(inputString, pos);
    if (!temporal) { temporal = recognizeOffset(inputString, pos); }

    if (!temporal) {
        // weekNum before week (w23 vs w)
        temporal = recognizeWeekNum(inputString, pos);
    }

    if (!temporal) {
        // modifier + weekday/week/weekNum
        const modR = recognizeModifier(inputString, pos);
        if (modR) {
            const afterMod = skipWs(inputString, modR.end);
            const wdR = recognizeWeekday(inputString, afterMod, locale);
            if (wdR) {
                tokens.push(modR.token);
                temporal = wdR;
                if (wdR.ambiguous) { ambiguous = true; }
            } else {
                const wnR = recognizeWeekNum(inputString, afterMod);
                if (wnR) {
                    tokens.push(modR.token);
                    temporal = wnR;
                } else {
                    const wkR = recognizeWeek(inputString, afterMod);
                    if (wkR) {
                        tokens.push(modR.token);
                        temporal = wkR;
                    }
                    // modifier without following week/weekday: don't consume — falls to text
                }
            }
        }
    }

    if (!temporal) {
        // plain weekday (no modifier)
        const wdR = recognizeWeekday(inputString, pos, locale);
        if (wdR) {
            temporal = wdR;
            if (wdR.ambiguous) { ambiguous = true; }
        }
    }

    if (!temporal) { temporal = recognizeISO(inputString, pos); }

    if (!temporal) {
        const wkR = recognizeWeek(inputString, pos);
        if (wkR) { temporal = wkR; }
    }

    if (!temporal) {
        // month + dayOfMonth pair
        const moR = recognizeMonth(inputString, pos, locale);
        if (moR) {
            const afterMo = skipWs(inputString, moR.end);
            const domR = recognizeDayOfMonth(inputString, afterMo);
            if (domR) {
                tokens.push(moR.token);
                temporal = domR;
                // store month token already pushed; dayOfMonth is temporal below
                // Re-type the last push to 'month', temporal is 'dayOfMonth'
            }
            // month alone: don't consume — falls to text
        }
    }

    if (temporal) {
        tokens.push(temporal.token);
        pos = skipWs(inputString, temporal.end);
        hasTemporal = true;
    }

    // post-flag
    if (hasTemporal) {
        const postFlagR = recognizeFlag(inputString, pos);
        if (postFlagR) { tokens.push(postFlagR.token); pos = skipWs(inputString, postFlagR.end); }
    }

    // text remainder
    if (pos < inputString.length) {
        tokens.push({ type: 'text', value: inputString.slice(pos).trim() });
    }

    const confidence: ParseConfidence = hasTemporal
        ? (ambiguous ? 'ambiguous' : 'resolved')
        : 'text-only';

    return { tokens, confidence };
}
