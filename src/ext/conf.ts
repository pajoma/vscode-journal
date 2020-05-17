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
    ENTRY, 
    ATTACHEMENT
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
                console.log(sp.value);
                
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
    public getNotesFilePattern(date: Date, input: string, _scopeId?: string): Q.Promise<ScopedTemplate> {
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
            });
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
    // private regExpDateFormats: RegExp = new RegExp(/\$\{(?:(year|month|day|localTime|localDate|weekday)|(d:\w+))\}/g);
    // fix for #52
    // private regExpDateFormats: RegExp = new RegExp(/\$\{(?:(year|month|day|localTime|localDate|weekday)|(d:\w+))\}/g);
    private regExpDateFormats: RegExp = new RegExp(/\$\{(?:(year|month|day|localTime|localDate|weekday)|(d:[\s\S]+?))\}/g);

    private replaceDateFormats(st: ScopedTemplate, date: Date): void {
        let matches: RegExpMatchArray = st.template.match(this.regExpDateFormats) || [];

        // console.log(JSON.stringify(matches));

        if (matches.length === 0) { return; }
        if (isNullOrUndefined(st.value)) { st.value = st.template; }

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
                case "${weekday}":
                    st.value = st.value!.replace(match, mom.format("dddd"));
                    break;
                default:
                    // check if custom format
                    if (match.startsWith("${d:")) {

                        let modifier = match.substring(match.indexOf("d:") + 2, match.length - 1); // includes } at the end
                        // st.template = st.template.replace(match, mom.format(modifier));
                        // fix for #51
                        st.value = st.value!.replace(match, mom.format(modifier));
                    }
                    break;
            }
        });
    }



    /**
     * Output format for calender format of moment.js, see https://momentjs.com/docs/#/displaying/calendar-time/
     * 
     * Used in the quickpicker description. The default also includes the time, which we don't want. 
     * 
     * FIXME: Externalise to properties (multilanguage)
     */
    public getInputDetailsTimeFormat() {
        let labels: string[] = new Array(4); 

        if(this.getLocale().startsWith("en")) {
            labels = ["for today", "for tomorrow", "for yesterday", "last"]
        } else if(this.getLocale().startsWith("de")) {
            labels = ["für heute", "für morgen", " für gestern", "letzten"]
        } else if(this.getLocale().startsWith("fr")) {
            labels = ["pour aujourd'hui", "pour demain", "d'hier"]
        } else if(this.getLocale().startsWith("es")) {
            labels = ["para hoy", "de mañana", "de ayer", "del último"]
        }

        let config = {
            sameDay: `[${labels[0]}]`,
            nextDay: `[${labels[1]}]`,
            nextWeek: 'dddd',
            lastDay: `[${labels[2]}]`,
            lastWeek: `[${labels[3]}] dddd`,
            sameElse: 'DD/MM/YYYY'
        }

        return config; 

        /*  
            Memo der Seite für morgen hinzufügen
            Add memo to the page for tomorrow
            Ajouter un mémo à la page pour demain
            Añadir un memo a la página de mañana

            Añadir un memo a la página de ayer

        */
    }



    /**
     * Generates the details for the QuickPick Box (when creating a task)
     * 
     * FIXME: Externalize to properties
     * @param dayAsString 
     */
    public getInputDetailsStringForTask(dayAsString: string): string {
        if(this.getLocale().startsWith("en")) {
            return `Add task to entry ${dayAsString}`; 
        } else if(this.getLocale().startsWith("de")) {
            return `Aufgabe zum Eintrag ${dayAsString} hinzufügen`; 
        } else if(this.getLocale().startsWith("fr")) {
            return `Ajouter une tâche à l'entrée ${dayAsString}`; 
        } else if(this.getLocale().startsWith("es")) {
            return `Agregar tarea a la entrada ${dayAsString}`; 
        } else {
            return `Add task to entry ${dayAsString}`; 
        }
    }

    public getInputDetailsStringForEntry(dayAsString: string) {
        if(this.getLocale().startsWith("en")) {
            return `Create or open entry ${dayAsString}`; 
        } else if(this.getLocale().startsWith("de")) {
            return `Eintrag für ${dayAsString} erstellen oder öffnen`; 
        } else if(this.getLocale().startsWith("fr")) {
            return `Créer ou ouvrir une entrée ${dayAsString}`; 
        } else if(this.getLocale().startsWith("es")) {
            return `Crear o abrir una entrada  ${dayAsString}`; 
        } else {
            return `Create or open entry ${dayAsString}`; 
        }
    }


    /**
     * Generates the details for the QuickPick Box (when creating a task)
     * 
     * FIXME: Externalize to properties
     * @param dayAsString 
     */
    public getInputDetailsStringForMemo(dayAsString: string) {
        if(this.getLocale().startsWith("en")) {
            return `Add memo to entry ${dayAsString}`; 
        } else if(this.getLocale().startsWith("de")) {
            return `Memo zum Eintrag ${dayAsString} hinzufügen`; 
        } else if(this.getLocale().startsWith("fr")) {
            return `Ajouter un mémo à l'entrée ${dayAsString}`; 
        } else if(this.getLocale().startsWith("es")) {
            return `Agregar un memo a la entrada ${dayAsString}`; 
        } else {
            return `Add memo to entry ${dayAsString}`; 
        }
    }


    private labelTranslations: Map<string, string> = new Map(); 
    public getInputLabelTranslation(code: number) {
        if(this.labelTranslations.size == 0) {
            this.labelTranslations.set("en"+ 1, "Today"); 
            this.labelTranslations.set("en"+ 2, "Tomorrow"); 
            this.labelTranslations.set("en"+ 3, "Select entry"); 
            this.labelTranslations.set("en"+ 4, "Select/Create a note"); 
            this.labelTranslations.set("en"+ 5, "Select attachement"); 

            this.labelTranslations.set("de"+ 1, "Heute"); 
            this.labelTranslations.set("de"+ 2, "Morgen"); 
            this.labelTranslations.set("de"+ 3, "Eintrag auswählen"); 
            this.labelTranslations.set("de"+ 4, "Notiz auswählen oder erstellen"); 
            this.labelTranslations.set("de"+ 5, "Anhang auswählen"); 

            this.labelTranslations.set("es"+ 1, "Hoy"); 
            this.labelTranslations.set("es"+ 2, "Mañana "); 
            this.labelTranslations.set("es"+ 3, "Seleccionar entrada"); 
            this.labelTranslations.set("es"+ 4, "Seleccionar o crear nota"); 
            this.labelTranslations.set("es"+ 5, "Seleccionar adjunto"); 


            this.labelTranslations.set("fr"+ 1, "Aujourd'hui"); 
            this.labelTranslations.set("fr"+ 2, "Demain"); 
            this.labelTranslations.set("fr"+ 3, "Sélectionner une entrée"); 
            this.labelTranslations.set("fr"+ 4, "Sélectionner ou créer une note"); 
            this.labelTranslations.set("fr"+ 5, "Sélectionner la pièce jointe"); 
        }
        let val = this.labelTranslations.get(this.getLocale().substring(0,2)+code); 
        if(isUndefined(val)) val = this.labelTranslations.get("en"+code); 

        return <string>val; 

    }

    private descTranslations: Map<string, string> = new Map(); 
    public getInputDetailsTranslation(code: number): string | undefined {
        if(this.descTranslations.size == 0) {
            this.descTranslations.set("en"+1, "Jump to today's entry."); 
            this.descTranslations.set("en"+2, "Jump to tomorrow's entry."); 
            this.descTranslations.set("en"+3, "Select from the last journal entries."); 
            this.descTranslations.set("en"+4, "Create a new note or select from recently created or updated notes."); 
            this.descTranslations.set("en"+5, "Select from the list of recently added attachements."); 

            this.descTranslations.set("de"+1, "Zum Eintrag für heute wechseln."); 
            this.descTranslations.set("de"+2, "Zum Eintrag für morgen wechseln."); 
            this.descTranslations.set("de"+3, "Wählen Sie aus den letzten Journaleinträgen aus. "); 
            this.descTranslations.set("de"+4, "Erstellen Sie eine neue Notiz oder wählen Sie aus den letzten Notizen aus."); 
            this.descTranslations.set("de"+5, "Wählen Sie aus der Liste der zuletzt hinzugefügten Anlagen aus."); 
            
            this.descTranslations.set("fr"+1, "Aller à l'entrée d'aujourd'hui."); 
            this.descTranslations.set("fr"+2, "Sautez à l'entrée de demain."); 
            this.descTranslations.set("fr"+3, "Sélectionnez l'une des dernières entrées."); 
            this.descTranslations.set("fr"+4, "Créez une nouvelle note ou sélectionnez une note parmi les notes récemment créées ou mises à jour."); 
            this.descTranslations.set("fr"+5, "Sélectionnez dans la liste des pièces jointes récemment ajoutées"); 

            this.descTranslations.set("es"+1, "Saltar a la entrada de hoy."); 
            this.descTranslations.set("es"+2, "Salta a la entrada de mañana."); 
            this.descTranslations.set("es"+3, "Seleccione una de las últimas entradas. "); 
            this.descTranslations.set("es"+4, "Cree una nueva nota o seleccione una de las notas creadas o actualizadas recientemente."); 
            this.descTranslations.set("es"+5, "Seleccione de la lista de archivos adjuntos añadidos recientemente"); 
        }
        let val = this.descTranslations.get(this.getLocale().substring(0,2)+code); 
        if(isUndefined(val)) val = this.labelTranslations.get("en"+code); 
        return <string>val; 

    }

    /**
     * Helper Method, threshold (maximal age) of files shown in the quick picker
     */
    getInputTimeThreshold(): number {
        let offset = 0;
        let d: Date = new Date();
        d.setDate(d.getDate() + --offset);
        return d.getTime(); 
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
        return this.getInlineTemplate("tpl-time", "LT", this.resolveScope(_scopeId))
            .then(tpl => {
                this.replaceDateFormats(tpl, new Date());
                return tpl;
            });
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
            try {
                this.loadPatterns()
                .then(b => {
                    let tpl: ScopedTemplate = <ScopedTemplate>this.patterns.get(id);
                    tpl.value = tpl.template;  // reset template
                    resolve(tpl);
                });
            } catch (error) {
                reject(error); 
            }
         
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


            type PatternDefinition = {  notes: { path: string, file: string }, entries: { path: string, file: string } };
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
                }
                
                // setting the default patterns
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


                // TODO: setting the scoped patterns

                resolve(true);
            } catch (error) {
                reject(error);
            }

        });



    }


   
}