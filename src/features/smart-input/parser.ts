// Copyright (C) 2022  Patrick Maué
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

import * as Path from 'path';
import { ILogger, Input } from '../../shared/model/index';
import { JournalPaths, JournalScopes, JournalSettings } from 'journal-core';
import { normalizeFilename, weekOf } from 'journal-core';
import { isNullOrUndefined } from '../../shared/index';
import { resolveTokens } from './date-resolver';
import { matchInput } from './match-input';
import { tokenize } from './tokenizer';

/**
 * Helper Methods to interpret the input strings
 */
export class Parser {

    constructor(private config: JournalSettings & JournalScopes & JournalPaths, private logger: ILogger) {
    }

    /**
     * Returns the file path for a given input. If the input includes a scope classifier ("#scope"), the path will be altered 
     * accordingly (depending on the configuration of the scope). 
     *
     * @param {string} input the input entered by the user
     * @returns {Q.Promise<string>} the path to the new file
     * @memberof JournalCommands
     * 
     */
    public async resolveNotePathForInput(input: Input, scopeId?: string): Promise<string> {



        this.logger.trace("Entering resolveNotePathForInput() in actions/parser.ts");

        const locale = this.config.getLocale();
        const date = input.anchorDate(locale);
        const week = input.hasWeek() ? { week: input.week, year: input.weekYear } : weekOf(date, locale);
        input.extractScopeAndTags(this.config.getScopes());
        this.logger.trace("Tags in input: " + input.tags + ", scope: " + input.scope);

        const inputForFileName = normalizeFilename(input.text);
        // notes of folder scopes always live in the scope folder, independent of the entry granularity
        const granularity = this.config.getScope(input.scope).notesFolder ? "daily" : this.config.getEntryGranularity(input.scope);
        const filePromise = granularity === "weekly"
            ? this.config.getWeeklyNotesFilePattern(
                week.week,
                week.year,
                inputForFileName,
                input.scope,
            )
            : this.config.getNotesFilePattern(date, inputForFileName, input.scope);
        const pathPromise = granularity === "weekly"
            ? this.config.getResolvedWeeklyNotesPath(
                week.week,
                week.year,
                input.scope,
            )
            : this.config.getResolvedNotesPath(date, input.scope);

        try {
            const [fileTemplate, pathTemplate] = await Promise.all([filePromise, pathPromise]);
            const path = Path.join(pathTemplate.value, fileTemplate.value.trim());
            this.logger.trace("Resolved path for note is", path);
            return path;
        } catch (error) {
            this.logger.error("Failed to resolve note path. Reason: ", error);
            throw error;
        }

    }



    /**
     * A note titled `title`, for today, or for the current week when entries
     * are weekly (#149). With `leadingDate`, a day or week at the start of the
     * title ("mon Review") picks the entry; words like "note" or "task" stay
     * in the title either way.
     */
    public noteInput(title: string, { leadingDate = false } = {}): Input {
        const locale = this.config.getLocale();
        const tokens = leadingDate ? tokenize(title, locale, { flags: false }).tokens : [{ type: 'text' as const, value: title }];
        const input = resolveTokens(tokens, new Date(), this.config.getEntryGranularity(), locale);
        input.kind = 'note';
        return input;
    }

    /**
     * Takes a string and separates the flag, date and text, relative to today
     * and with the configured locale and entry granularity.
     *
     * @param inputString the value to be parsed; undefined when the dialog was cancelled
     * @returns the resolved input object
     */
    public async parseInput(inputString: string): Promise<Input> {
        this.logger.trace("Entering parseInput() in smart-input/parser.ts with input string '", inputString, "'");

        if (isNullOrUndefined(inputString)) {
            throw new Error("cancel");
        }

        try {
            // today is read per call, so that the long-lived parser doesn't use a stale date (#170)
            const input = matchInput(inputString, this.config.getLocale(), this.config.getEntryGranularity(), new Date());
            this.logger.trace("Parsed input: ", JSON.stringify(input));
            return input;
        } catch (error) {
            this.logger.error("Failed to parse input from string '", inputString, "' due to reason: ", error instanceof Error ? error.message : error);
            throw error;
        }
    }




}

