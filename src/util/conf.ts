'use strict';

import * as vscode from 'vscode';

/**
 * All config parameters in one place
 */
export class Configuration {

    constructor(public config: vscode.WorkspaceConfiguration) {

    }

    public getLocale(): string {
        let locale: string = this.config.get<string>('locale');
        return (locale.length == 0) ? locale : 'en-US'; 
    }


    public getBasePath(): string {
        let base = this.config.get<string>('base');
        if(! base.endsWith("/")) base.concat("/"); 

        return base; 

        // TODO: default should be user documents dir 
    }

    // defaults to .md
    public getFileExtension(): string {
        let ext: string = this.config.get<string>('ext'); 
        return (ext.length > 0) ? ext : '.md'; 
    }

    public getPageTemplate(): string {
        return this.config.get<string>('tpl-page');
    }

    public getMemoTemplate(): string {
        return this.config.get<string>('tpl-memo'); 
    }

    public getTaskTemplate(): string {
        return this.config.get<string>('tpl-task'); 
    }


}