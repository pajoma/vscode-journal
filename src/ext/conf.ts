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
import { isNullOrUndefined } from 'util';

const SCOPE_DEFAULT = "default";

export interface ScopedTemplate {
    scope: string;
    id: string;
    template: string;
}

export interface FileTemplate extends ScopedTemplate {

}

export interface InlineTemplate extends FileTemplate {
    after: string;
}

/**
 * Manages access to journal configuration. 
 * 
 * Attention: This is an intermediate implementation, still based on the old configuration pre 0.6
 * 
 */
export class Configuration {



    constructor(public config: vscode.WorkspaceConfiguration) {

    }



    public getLocale(): string {
        let locale: string | undefined = this.config.get<string>('locale');
        return (isNullOrUndefined(locale) || (locale!.length === 0)) ? 'en-US' : locale!;
    }




    public getBasePath(_scopeId?: string): string {

        let base: string | undefined = this.config.get<string>('base');

        if(! isNullOrUndefined(base) && base!.length > 0) {
            return Path.resolve(base);
        } else {
             // let's default to user profile
            return Path.resolve(os.homedir(), "Journal");
        }

    }

    // defaults to md
    public getFileExtension(_scopeId?: string): string {
        let ext: string | undefined =  this.config.get<string>('ext');
        ext = (isNullOrUndefined(ext) && (ext!.length === 0)) ?  'md' : ext;

        if (ext!.startsWith(".")) { ext = ext!.substring(1, ext!.length); }

        return ext!; 
    }


    /**
     *
     * Retrieves the (scoped) file template for a journal entry. 
     * 
     * Default value is: "# {content}\n\n",
     * @param {string} [_scopeId]
     * @returns {Q.Promise<FileTemplate>}
     * @memberof Configuration
     */
    public getEntryTemplate(_scopeId?: string): Q.Promise<FileTemplate> {
        return Q.Promise<FileTemplate>((resolve, reject) => {
            try {
                let tpl = this.config.get<string>('tpl-entry');

                let result: FileTemplate = {
                    id: "file-entry",
                    scope: _scopeId ? _scopeId : SCOPE_DEFAULT,
                    template: tpl ? tpl : '# ${input}\n\n',
                };

                // backwards compatibility, replace {content} with ${input} as default
                result.template = result.template.replace("{content}", "${input}");

                resolve(result);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
       * Retrieves the (scoped) file template for a note. 
       * 
       * Default value is: "# {content}\n\n",
       *
       * @param {string} [_scopeId]  identifier of the scope
       * @returns {Q.Promise<FileTemplate>} scoped file template for notes
       * @memberof Configuration 
       */
    public getNotesTemplate(_scopeId?: string): Q.Promise<FileTemplate> {
        return Q.Promise<FileTemplate>((resolve, reject) => {
            try {
                let tpl = this.config.get<string>('tpl-note');

                let result: FileTemplate = {
                    id: "file-note",
                    scope: _scopeId ? _scopeId : SCOPE_DEFAULT,
                    template: tpl ? tpl : '# ${input}\n\n',
                };

                // backwards compatibility, replace {content} with ${input} as default
                result.template = result.template.replace("{content}", "${input}");

                resolve(result);
            } catch (error) {
                reject(error);
            }
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
        return Q.Promise<InlineTemplate>((resolve, reject) => {
            try {
                let tpl = this.config.get<string>('tpl-memo');
                let after = this.config.get<string>('tpl-memo-after');

                let result: InlineTemplate = {
                    id: "memo",
                    scope: _scopeId ? _scopeId : SCOPE_DEFAULT,
                    template: tpl ? tpl : '- MEMO: ${input}',
                    after: after ? after : ''
                };

                // backwards compatibility, replace {} with ${} (ts template strings) as default
                result.template = result.template.replace("{content}", "${input}");

                resolve(result);
            } catch (error) {
                reject(error);
            }
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
        return Q.Promise<InlineTemplate>((resolve, reject) => {
            try {
                let tpl = this.config.get<string>('tpl-files');
                let after = this.config.get<string>('tpl-files-after');

                let result: InlineTemplate = {
                    id: "inline-link",
                    after: after ? after : '',
                    scope: _scopeId ? _scopeId : SCOPE_DEFAULT,
                    template: tpl ? tpl : '- Link: [${label}](${link})',
                };

                
                // backwards compatibility, replace {} with ${} (ts template strings) as default
                result.template = result.template.replace("{label}", "${title}");

                // replacing {link} with ${link} results in $${link} (cause $ is ignored)
                if(result.template.search("\\$\\{link\\}")=== -1) {
                    result.template = result.template.replace("{link}", "${link}");
                }   

                resolve(result);
            } catch (error) {
                reject(error);
            }
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
        return Q.Promise<InlineTemplate>((resolve, reject) => {
            try {
                let tpl = this.config.get<string>('tpl-task');
                let after = this.config.get<string>('tpl-task-after');

                let result: InlineTemplate = {
                    id: "inline-task",
                    scope: _scopeId ? _scopeId : SCOPE_DEFAULT,
                    template: tpl ? tpl : '- [ ] ${input}',
                    after: after ? after : ''
                };

                
                // backwards compatibility, replace {content} with ${input} as default
                result.template = result.template.replace("{content}", "${input}");

                resolve(result);
            } catch (error) {
                reject(error);
            }
        });
    }


    public getTimeString() : string | undefined {
        return this.config.get<string>('tpl-time');
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
    public getTimeStringTemplate(_scopeId?: string): Q.Promise<InlineTemplate> {
        return Q.Promise<InlineTemplate>((resolve, reject) => {
            try {
                let tpl = this.config.get<string>('tpl-time');

                let result: InlineTemplate = {
                    id: "inline-time",
                    scope: _scopeId ? _scopeId : SCOPE_DEFAULT,
                    template: tpl ? tpl : 'LT', 
                    after: ''
                }; 

                resolve(result);
            } catch (error) {
                reject(error);
            }
        });
    }
    

    public isDevelopmentModeEnabled(): boolean {
        let dev: boolean | undefined =  this.config.get<boolean>('dev');
        return (! isNullOrUndefined(dev)) ? dev! : false;
    }

    public isOpenInNewEditorGroup(): boolean {
        let res: boolean | undefined =  this.config.get<boolean>('openInNewEditorGroup');
        return (! isNullOrUndefined(res)) ? res! : false;
    }
}