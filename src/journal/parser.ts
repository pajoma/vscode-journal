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
import { IConfiguration, ILogger, Input } from '../model';
import { normalizeFilename, getCurrentISOWeek, getISOWeekYear } from '../util';
import { MatchInput } from './match-input';

/**
 * Helper Methods to interpret the input strings
 */
export class Parser {

    constructor(private config: IConfiguration, private logger: ILogger) {
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

        const date = input.generateDate();
        input.extractScopeAndTags(this.config.getScopes());
        this.logger.trace("Tags in input: " + input.tags + ", scope: " + input.scope);

        const inputForFileName = normalizeFilename(input.text);
        const granularity = this.config.getEntryGranularity(input.scope);
        const filePromise = granularity === "weekly"
            ? this.config.getWeeklyNotesFilePattern(
                getCurrentISOWeek(date),
                getISOWeekYear(date),
                inputForFileName,
                input.scope,
            )
            : this.config.getNotesFilePattern(date, inputForFileName, input.scope);
        const pathPromise = granularity === "weekly"
            ? this.config.getResolvedWeeklyNotesPath(
                getCurrentISOWeek(date),
                getISOWeekYear(date),
                input.scope,
            )
            : this.config.getResolvedNotesPath(date, input.scope);

        try {
            const [fileTemplate, pathTemplate] = await Promise.all([filePromise, pathPromise]);
            const path = Path.join(pathTemplate.value!, fileTemplate.value!.trim());
            this.logger.trace("Resolved path for note is", path);
            return path;
        } catch (error) {
            this.logger.error("Failed to resolve note path. Reason: ", error);
            throw error;
        }

    }



    /**
     * Takes a string and separates the flag, date and text
     *
     * @param {string} inputString the value to be parsed
     * @returns {Promise<J.Model.Input>} the resolved input object
     * @memberof Parser
     */
    public async parseInput(inputString: string): Promise<Input> {
        let inputMatcher = new MatchInput(
            this.logger,
            this.config.getLocale(),
            this.config.getEntryGranularity(),
        );
        return inputMatcher.parseInput(inputString);

    }




}

