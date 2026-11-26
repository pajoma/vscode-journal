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

import { resolveTemporal, Token, weekOf } from 'journal-core';
import { EntryGranularity, Input } from '../../shared/model/index';

/**
 * Turns the tokens of smart input into an Input: the day offset (or week)
 * relative to `today`, the kind and the text. Without a date, the input goes
 * to today, or to the current week when entries are weekly. What a date
 * expression means is decided by journal-core's `resolveTemporal`, shared
 * with the MCP server.
 */
export function resolveTokens(tokens: Token[], today: Date, granularity: EntryGranularity, locale: string): Input {
    const result = new Input();
    const find = <T extends Token['type']>(type: T) => tokens.find((t): t is Extract<Token, { type: T }> => t.type === type);

    result.text = find('text')?.value.trim() ?? '';

    const target = resolveTemporal(tokens, today, locale);
    if (target && 'week' in target) {
        result.setWeek(target.week, target.year);
        result.offset = NaN;
    } else if (target) {
        result.offset = target.offset;
    } else if (granularity === 'weekly') {
        const current = weekOf(today, locale);
        result.setWeek(current.week, current.year);
        result.offset = NaN;
    } else {
        result.offset = 0;
    }

    // "task"/"todo" before or after the date adds a task, "note" creates a note
    // for that day or week (#149); any other text is a memo
    const flag = find('flag')?.value;
    if (flag === 'note') {
        if (!result.hasText()) { throw new Error('No title found for note'); }
        result.kind = 'note';
    } else if (flag) {
        if (!result.hasText()) { throw new Error('No text found for memo or task'); }
        result.kind = 'task';
    } else if (result.hasText()) {
        result.kind = 'memo';
    }
    return result;
}
