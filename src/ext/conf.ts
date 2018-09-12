// Copyright (C) 2016  Patrick Maué
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

import * as vscode from 'vscode';
import * as os from 'os';
import * as Path from 'path';
import * as Q from 'q';
import { isNullOrUndefined, isNull, isUndefined } from 'util';
import * as moment from 'moment';

export const SCOPE_DEFAULT = "default";



export enum JournalPageType {
    NOTE,
    ENTRY
}

export interface ScopedTemplate {
    scope: string;
    id: string;
    template: string;
    value?: string;
}



export interface FilePattern extends ScopedTemplate {
    type: JournalPageType;
}

export interface PathTemplate extends ScopedTemplate {
    type: JournalPageType;
}

export interface HeaderTemplate extends ScopedTemplate {
}

export interface InlineTemplate extends ScopedTemplate {
    after: string;
}

/**
 * Manages access to journal configuration. 
 * 
 * Attention: This is an intermediate implementation, still based on the old configuration pre 0.6
 * 
 */
export class Configuration {

    private patterns: Map<string, ScopedTemplate> = new Map();


    constructor(public config: vscode.WorkspaceConfiguration) {

    }



    public getLocale(): string {
        let locale: string | undefined = this.config.get<string>('locale');
        return (isNullOrUndefined(locale) || (locale!.length === 0)) ? 'en-US' : locale!;
    }



    /**
     * The base path, defaults to %USERPROFILE"/Journal
     * 
     * Supported variables: ${homeDir}
     * 
     * @param _scopeId not supported
     */
    public getBasePath(_scopeId?: string): string {


        let base: string | undefined = this.config.get<string>('base');

        if (!isNullOrUndefined(base) && base!.length > 0) {
            // resolve homedir
            base = base.replace("${homeDir}", os.homedir());
            

            base = Path.normalize(base);

            return Path.format(Path.parse(base));


        } else {
            // let's default to user profile
            return Path.resolve(os.homedir(), "Journal");
        }

    }

    /**
     * Configuration of file extension for notes and journal entries. Defaults to "md" for markdown. 
     * 
     * 
     * @param _scopeId 
     */
    public getFileExtension(_scopeId?: string): string {
        let ext: string | undefined = this.config.get<string>('ext');
        ext = (isNullOrUndefined(ext) && (ext!.length === 0)) ? 'md' : ext;

        if (ext!.startsWith(".")) { ext = ext!.substring(1, ext!.length); }

        return ext!;
    }

    /**
     * Configuration for the path, where the notes are to be placed
     * 
     * Supported variables: homeDir, base, year, month, day, moment
     * 
     * @param _scopeId default or individual
     */
    public getNotesPathPattern(date: Date, _scopeId?: string): Q.Promise<ScopedTemplate> {
        return (<Q.Promise<ScopedTemplate>>this.getPattern(this.resolveScope(_scopeId) + ".pattern.notes.path"))
            .then((sp: ScopedTemplate) => {

                this.replaceVariableValue("homeDir", os.homedir(), sp);
                this.replaceVariableValue("base", this.getBasePath(_scopeId), sp);
                this.replaceDateFormats(sp, date);
                return sp;
            });


    }

    /**
     * Configuration for the filename, under which the notes file is stored
     * 
     * Supported variables: year, month, day, df, ext, input
     * 
     * @param _scopeId default or individual
     */
    public getNotesFilePattern(date: Date, input: string,  _scopeId?: string): Q.Promise<ScopedTemplate> {
        return this.getPattern(this.resolveScope(_scopeId) + ".pattern.notes.file")
            .then((sp: ScopedTemplate) => {
                
                let mom: moment.Moment = moment(date);

                this.replaceVariableValue("ext", this.getFileExtension(), sp);
                this.replaceVariableValue("input", input, sp); 
                this.replaceDateFormats(sp, date);
                return sp;
            });

    }

    /**
     * Configuration for the path, under which the  journal entry  file is stored
     * 
     * Supported variables: base, year, month, day, df
     * 
     * @param _scopeId default or individual
     */
    public getEntryPathPattern(date: Date, _scopeId?: string): Q.Promise<ScopedTemplate> {
        return this.getPattern(this.resolveScope(_scopeId) + ".pattern.entries.path")
            .then((sp: ScopedTemplate) => {
                let mom: moment.Moment = moment(date);

                // resolve variables
                this.replaceVariableValue("base", this.getBasePath(_scopeId), sp);
                this.replaceDateFormats(sp, date);

                // clean path
                sp.value = Path.normalize(sp.value!);

                return sp;
            })

            ;
    }
    /**
   * Configuration for the filename, under which the journal entry file is stored
   * 
   * Supported variables: year, month, day, moment, ext
   * 
   * @param _scopeId default or individual
   */
    public getEntryFilePattern(date: Date, _scopeId?: string): Q.Promise<ScopedTemplate> {
        return this.getPattern(this.resolveScope(_scopeId) + ".pattern.entries.file")
            .then((sp: ScopedTemplate) => {
                let mom: moment.Moment = moment(date);

                // resolve variables
                this.replaceDateFormats(sp, date);
                this.replaceVariableValue("ext", this.getFileExtension(_scopeId), sp);

                return sp;
            });
    }



    private replaceVariableValue(key: string, value: string, st: ScopedTemplate): void {
        if (st.value!.search("\\$\\{" + key + "\\}") >= 0) {
            st.value = st.value!.replace("${" + key + "}", value);
        }
    }

    /**
     * Checks whether any embedded expressions with date formats are in the template, and replaces them using the given date. 
     * 
     * @param st
     * @param date 
     */
    // https://regex101.com/r/i5MUpx/1/
    private regExpDateFormats: RegExp = new RegExp(/\$\{(?:(year|month|day|localTime|localDate)|(d:\w+))\}/g);
    private replaceDateFormats(st: ScopedTemplate, date: Date): void {
        let matches: RegExpMatchArray = st.template.match(this.regExpDateFormats) || [];

        // console.log(JSON.stringify(matches));

        if (matches.length === 0) { return; }
        if (isNullOrUndefined(st.value)) {st.value = st.template; }

        let mom: moment.Moment = moment(date);
        moment.locale(this.getLocale());

        matches.forEach(match => {
            switch (match) {
                case "${year}":
                    st.value = st.value!.replace(match, mom.format("YYYY"));
                    break;
                case "${month}":
                    st.value = st.value!.replace(match, mom.format("MM"));
                    break;
                case "${day}":
                    st.value = st.value!.replace(match, mom.format("DD"));
                    break;
                case "${localTime}":
                    st.value = st.value!.replace(match, mom.format("LT"));
                    break;
                case "${localDate}":
                    st.value = st.value!.replace(match, mom.format("LL"));
                    break;
                default:
                    // check if custom format
                    if (match.startsWith("${d:")) {

                        let modifier = match.substring(match.indexOf("d:") + 2, match.length - 1); // includes } at the end
                        st.template = st.template.replace(match, mom.format(modifier));
                    }
                    break;
            }
        });
    }






    /**
     *
     * Retrieves the (scoped) inline template for a journal entry. 
     * 
     * Supported variables: localDate, year, month, day, format
     * 
     * Default value is: "# ${localDate}\n\n",
     * @param {string} [_scopeId]
     * @returns {Q.Promise<FileTemplate>}
     * @memberof Configuration
     */
    public getEntryTemplate(date: Date, _scopeId?: string): Q.Promise<HeaderTemplate> {
        return this.getInlineTemplate("tpl-entry", "# ${localDate}\n\n", this.resolveScope(_scopeId))
            .then((sp: ScopedTemplate) => {

                // backwards compatibility, replace {content} with ${input} as default
                sp.template = sp.template.replace("{content}", "${localDate}");

                this.replaceDateFormats(sp, date);
                this.replaceVariableValue("base", this.getBasePath(_scopeId), sp);

                return sp;
            });
    }

    /**
       * Retrieves the (scoped) file template for a note. 
       * 
       * Default value is: "# ${input}\n\n",
       *
       * @param {string} [_scopeId]  identifier of the scope
       * @returns {Q.Promise<FileTemplate>} scoped file template for notes
       * @memberof Configuration 
       */
    public getNotesTemplate(_scopeId?: string): Q.Promise<HeaderTemplate> {
        return this.getInlineTemplate("tpl-note", "# ${input}\n\n", this.resolveScope(_scopeId))
            .then((result: ScopedTemplate) => {
                // backwards compatibility, replace {content} with ${input} as default
                result.template = result.template.replace("{content}", "${input}");

                this.replaceDateFormats(result, new Date());

                return result;
            });
    }


    /**
     * Retrieves the (scoped) inline template for a memo. 
     * 
     * Default value is: "- MEMO: {content}",
     *
     * @param {string} [_scopeId]
     * @returns {Q.Promise<InlineTemplate>}
     * @memberof Configuration
     */
    public getMemoInlineTemplate(_scopeId?: string): Q.Promise<InlineTemplate> {
        return this.getInlineTemplate("tpl-memo", "- MEMO: ${input}", this.resolveScope(_scopeId))
            .then((result: InlineTemplate) => {
                // backwards compatibility, replace {} with ${} (embedded expressions) as default
                result.template = result.template.replace("{content}", "${input}");

                this.replaceDateFormats(result, new Date());
                return result;
            });
    }



    /**
     * Retrieves the (scoped) file template for a note. 
     * 
     * Default value is: "# {content}\n\n",
     *
     * @param {string} [_scopeId]
     * @returns {Q.Promise<FileTemplate>}
     * @memberof Configuration
     */
    public getFileLinkInlineTemplate(_scopeId?: string): Q.Promise<InlineTemplate> {
        return this.getInlineTemplate("tpl-files", "- Link: [${label}](${link})", this.resolveScope(_scopeId))
            .then((result: InlineTemplate) => {
                // backwards compatibility, replace {} with ${} (ts embedded expressions) as default
                result.template = result.template.replace("{label}", "${title}");

                // replacing {link} with ${link} results in $${link} (cause $ is ignored)
                if (result.template.search("\\$\\{link\\}") === -1) {
                    result.template = result.template.replace("{link}", "${link}");
                }

                return result;
            });
    }

    /**
     * Retrieves the (scoped) inline template for a task. 
     * 
     * Default value is: "- [ ] {content}",
     *
     * @param {string} [_scopeId]
     * @returns {Q.Promise<InlineTemplate>}
     * @memberof Configuration
     */
    public getTaskInlineTemplate(_scopeId?: string): Q.Promise<InlineTemplate> {
        return this.getInlineTemplate("tpl-task", "- [ ] ${input}", this.resolveScope(_scopeId))
            .then((res: InlineTemplate) => {
                // backwards compatibility, replace {content} with ${input} as default
                res.template = res.template.replace("{content}", "${input}");

                this.replaceDateFormats(res, new Date());

                return res;
            });
    }


    /**
     * Returns the template used for printing the time
     * 
     * Supported variables: localTime
     */
    public getTimeString(): string | undefined {
        let cv = this.config.get<string>('tpl-time');
        cv = isNullOrUndefined(cv) ? "LT" : cv; 

        cv = cv.replace("${localTime}", "LT");
        return cv; 
    }


    /**
     * Retrieves the (scoped) inline template for a time string. 
     * 
     * Default value is: "LT" (Local Time),
     *
     * @param {string} [_scopeId]
     * @returns {Q.Promise<InlineTemplate>}
     * @memberof Configuration
     */
    public getTimeStringTemplate(_scopeId?: string): Q.Promise<ScopedTemplate> {
        return this.getInlineTemplate("tpl-time", "LT", this.resolveScope(_scopeId));
    }


    public isDevelopmentModeEnabled(): boolean {
        let dev: boolean | undefined = this.config.get<boolean>('dev');
        return (!isNullOrUndefined(dev)) ? dev! : false;
    }

    public isOpenInNewEditorGroup(): boolean {
        let res: boolean | undefined = this.config.get<boolean>('openInNewEditorGroup');
        return (!isNullOrUndefined(res)) ? res! : false;
    }


    /***** PRIVATES *******/

    /**
     * Returns a valid scope, falls back to default. 
     * 
     * @param _scopeId 
     */
    private resolveScope(_scopeId?: string): string {
        return (isNullOrUndefined(_scopeId) || (_scopeId!.length === 0)) ? SCOPE_DEFAULT : _scopeId!;
    }

    /**
     * Returns the pattern with the given id (loads them from vscode config if needed)
     * @param id 
     */
    private getPattern(id: string): Q.Promise<ScopedTemplate> {
        return Q.Promise<ScopedTemplate>((resolve, reject) => {
            this.loadPatterns()
                .then(b => {
                    let tpl: ScopedTemplate = <ScopedTemplate>this.patterns.get(id);
                    tpl.value = tpl.template;  // reset template
                    resolve(tpl);
                });
        });
    }



    private getInlineTemplate(_id: string, _defaultValue: string, _scopeId: string): Q.Promise<InlineTemplate> {
        return Q.Promise<InlineTemplate>((resolve, reject) => {

            try {
                let key: string = _scopeId + "." + _id;
                let pattern: InlineTemplate = <InlineTemplate>this.patterns.get(key);
                if (isNullOrUndefined(pattern)) {

                    let tpl = this.config.get<string>(_id);
                    let after = this.config.get<string>(_id + '-after');

                    pattern = {
                        id: _id,
                        scope: this.resolveScope(_scopeId),
                        template: isNullOrUndefined(tpl) ? _defaultValue : tpl,
                        after: isNullOrUndefined(after) ? '' : after
                    };
                    this.patterns.set(key, pattern);


                }

                pattern.value = pattern.template;
                resolve(pattern);
            } catch (error) {
                reject(error);
            }
            
        });
    }

    /** 
     * Loads the patterns if needed from the vscode configuration. 
     */
    private loadPatterns(): Q.Promise<boolean> {
        return Q.Promise<boolean>((resolve, reject) => {
            if (this.patterns.size > 0) {
                resolve(true);
                return;
            }


            type PatternDefinition = { notes: { path: string, file: string }, entries: { path: string, file: string } };
            let config: PatternDefinition | undefined = this.config.get<PatternDefinition>('patterns');



            //FIXME: support scopes
            try {
                if (isNullOrUndefined(config)) {
                    config = {
                        notes: {
                            path: "${base}/${year}/${month}/${day}",
                            file: "${input}.${ext}"
                        },
                        entries: {
                            path: "${base}/${year}/${month}",
                            file: "${day}.${ext}"
                        }
                    };
                } else {

                    this.patterns.set("default.pattern.notes.path",
                        {
                            id: "default.pattern.notes.path",
                            scope: "default",
                            template: config.notes.path
                        });
                    this.patterns.set("default.pattern.notes.file",
                        {
                            id: "default.pattern.notes.file",
                            scope: "default",
                            template: config.notes.file
                        });
                    this.patterns.set("default.pattern.entries.path",
                        {
                            id: "default.pattern.entries.path",
                            scope: "default",
                            template: config.entries.path
                        });
                    this.patterns.set("default.pattern.entries.file",
                        {
                            id: "default.pattern.entries.file",
                            scope: "default",
                            template: config.entries.file
                        });
                }
                resolve(true);
            } catch (error) {
                reject(error);
            }

        });



    }
}