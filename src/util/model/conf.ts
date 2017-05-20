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
import * as os from 'os'
import * as Path from 'path'; 

export class TemplateInfo {
    constructor(public Template: string, public After: string) {}
} 

/**
 * All config parameters in one place
 */
export class Configuration {



    constructor(public config: vscode.WorkspaceConfiguration) {

    }

    

    public getLocale(): string {
        let locale: string = this.config.get<string>('locale');
        return (locale.length > 0) ? locale : 'en-US'; 
    }


    public isDevEnabled(): boolean {
        let dev:boolean = this.config.get<boolean>('dev'); 
        return (dev) ? dev : false;  
    }

    public getBasePath(): string {

        let base = this.config.get<string>('base');
        
        if(base.length > 0) {
            return Path.resolve(base);
        } else {
            // let's default to documents dir in user profile
            return Path.resolve(os.homedir(), "Journal"); 
        }
    }

    // defaults to md
    public getFileExtension(): string {
        let ext: string = this.config.get<string>('ext'); 
        if(ext.startsWith(".")) ext = ext.substring(1,ext.length); 
        return (ext.length > 0) ? ext : 'md'; 
    }



    
    public getPageTemplate(): string {
        return this.config.get<string>('tpl-page');
    }

    public getNotesPagesTemplate(): string {
        return this.config.get<string>('tpl-note');
    }

    public getMemoTemplate(): string {
        return this.config.get<string>('tpl-memo'); 
    }

    public getNotesTemplate(): TemplateInfo {
        return new TemplateInfo(this.config.get<string>('tpl-files'), this.config.get<string>('tpl-files-after')); 
    }

    public getTaskTemplate(): TemplateInfo {
        return new TemplateInfo(this.config.get<string>('tpl-task'), this.config.get<string>('tpl-task-after')); 
    }
    public getTodoTemplate() {
        return new TemplateInfo(this.config.get<string>('tpl-todo'), this.config.get<string>('tpl-todo-after'));
    }
}