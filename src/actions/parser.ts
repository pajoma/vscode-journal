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

import * as J from '../.';
import * as Path from 'path';

import { SCOPE_DEFAULT } from '../ext';

/**
 * Helper Methods to interpret the input strings
 */
export class Parser {
    public today: Date;

    constructor(public ctrl: J.Util.Ctrl) {
        this.today = new Date();
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
    public async resolveNotePathForInput(input: J.Model.Input, scopeId?: string): Promise<string> {
        


        return new Promise((resolve, reject) => {
            this.ctrl.logger.trace("Entering resolveNotePathForInput() in actions/parser.ts");
            
            // Unscoped Notes are always created in today's folder
            let date = new Date();
            let path: string = "";
            input.scope = SCOPE_DEFAULT;  

            // purge all tags from filename

            // all tags are filtered out. tags representing scopes are recognized here for resolving the note path.
            input.text.match(/#\w+\s/g)?.forEach(tag => {
                if(J.Util.isNullOrUndefined(tag) || tag!.length === 0) {return;} 

                this.ctrl.logger.trace("Tags in input string: "+tag);
                
                // remove from value
                input.tags.push(tag.trim().substring(0, tag.length-1)); 
                input.text = input.text.replace(tag, " "); 

                // identify scope, input is #tag
                this.ctrl.logger.trace("Scopes defined in configuration: "+this.ctrl.config.getScopes());
                let scope: string | undefined = this.ctrl.config.getScopes().filter((name: string) => name === tag.trim().substring(1, tag.length)).pop(); 
               
                
                if(J.Util.isNotNullOrUndefined(scope) && scope!.length > 0) {
                    input.scope = scope!; 
                } 
                
                this.ctrl.logger.trace("Identified scope in input: "+input.scope);
                
            });


            let inputForFileName: string = J.Util.normalizeFilename(input.text);

            Promise.all([
                this.ctrl.config.getNotesFilePattern(date, inputForFileName, input.scope), 
                this.ctrl.config.getResolvedNotesPath(date, input.scope), 
                ])
                
            .then(([fileTemplate, pathTemplate]) => {
                path = Path.join(pathTemplate.value!, fileTemplate.value!.trim());
                this.ctrl.logger.trace("Resolved path for note is", path);
                resolve(path); 
            })
            .catch(error => {
                this.ctrl.logger.error(error);
                reject(error);

            });

        }); 

    }



    /**
     * Takes a string and separates the flag, date and text
     *
     * @param {string} inputString the value to be parsed
     * @returns {Promise<J.Model.Input>} the resolved input object
     * @memberof Parser
     */
    public async parseInput(inputString: string): Promise<J.Model.Input> {
        let inputMatcher = new J.Provider.MatchInput(this.ctrl.logger, this.ctrl.config.getLocale());
        return inputMatcher.parseInput(inputString); 

    }




}

