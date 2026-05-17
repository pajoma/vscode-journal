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
import { JournalController, Input } from '../model';
import { isNullOrUndefined, isNotNullOrUndefined, normalizeFilename, getCurrentISOWeek, getISOWeekYear } from '../util';
import { SCOPE_DEFAULT } from '../ext';
import { MatchInput } from '../provider/features/match-input';

/**
 * Helper Methods to interpret the input strings
 */
export class Parser {

    constructor(public ctrl: JournalController) {
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



        this.ctrl.logger.trace("Entering resolveNotePathForInput() in actions/parser.ts");

        const date = new Date();
        input.scope = SCOPE_DEFAULT;

        input.text.match(/#\w+\s/g)?.forEach(tag => {
            if (isNullOrUndefined(tag) || tag!.length === 0) { return; }
            this.ctrl.logger.trace("Tags in input string: " + tag);
            input.tags.push(tag.trim().substring(0, tag.length - 1));
            input.text = input.text.replace(tag, " ");
            this.ctrl.logger.trace("Scopes defined in configuration: " + this.ctrl.config.getScopes());
            const scope: string | undefined = this.ctrl.config.getScopes().filter((name: string) => name === tag.trim().substring(1, tag.length)).pop();
            if (isNotNullOrUndefined(scope) && scope!.length > 0) {
                input.scope = scope!;
            }
            this.ctrl.logger.trace("Identified scope in input: " + input.scope);
        });

        const inputForFileName = normalizeFilename(input.text);
        const granularity = this.ctrl.config.getEntryGranularity(input.scope);
        const filePromise = granularity === "weekly"
            ? this.ctrl.config.getWeeklyNotesFilePattern(
                getCurrentISOWeek(date),
                getISOWeekYear(date),
                inputForFileName,
                input.scope,
            )
            : this.ctrl.config.getNotesFilePattern(date, inputForFileName, input.scope);
        const pathPromise = granularity === "weekly"
            ? this.ctrl.config.getResolvedWeeklyNotesPath(
                getCurrentISOWeek(date),
                getISOWeekYear(date),
                input.scope,
            )
            : this.ctrl.config.getResolvedNotesPath(date, input.scope);

        try {
            const [fileTemplate, pathTemplate] = await Promise.all([filePromise, pathPromise]);
            const path = Path.join(pathTemplate.value!, fileTemplate.value!.trim());
            this.ctrl.logger.trace("Resolved path for note is", path);
            return path;
        } catch (error) {
            this.ctrl.logger.error("Failed to resolve note path. Reason: ", error);
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
            this.ctrl.logger,
            this.ctrl.config.getLocale(),
            this.ctrl.config.getEntryGranularity(),
        );
        return inputMatcher.parseInput(inputString);

    }




}

