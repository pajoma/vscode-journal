// Copyright (C) 2018  Patrick Maué
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
import * as J from '../.';
import * as Q from 'q';
import * as Path from 'path';
import * as fs from 'fs';

export class Startup {

    /**
     *
     */
    constructor(public context: vscode.ExtensionContext, public config: vscode.WorkspaceConfiguration) {

    }


    
    public async initialize(): Promise<J.Util.Ctrl> {
        return Q.Promise<J.Util.Ctrl>((resolve, reject) => {
            try {
                let ctrl = new J.Util.Ctrl(this.config);
                if (ctrl.config.isDevelopmentModeEnabled() === true) {
                    console.log("Development Mode for Journal extension is enabled, Tracing in Console and Output is activated.");
                }

                resolve(ctrl);  
            } catch (error) {
                reject(error);
            }
        });
    }

    public async registerLoggingChannel(ctrl: J.Util.Ctrl, context: vscode.ExtensionContext): Promise<J.Util.Ctrl> {
        return Q.Promise<J.Util.Ctrl>((resolve, reject) => {
            try {
                let channel: vscode.OutputChannel =  vscode.window.createOutputChannel("Journal"); 
                context.subscriptions.push(channel); 
                ctrl.logger = new J.Util.Logger(ctrl, channel); 
                ctrl.logger.debug("VSCode Journal is starting"); 

                resolve(ctrl); 
            } catch (error) {
                reject(error); 
            }
       

        }); 
    }

    public async registerCodeLens(ctrl: J.Util.Ctrl, context: vscode.ExtensionContext): Promise<J.Util.Ctrl> {
        return Q.Promise<J.Util.Ctrl>((resolve, reject) => {
            try {
                const codeLensProvider = new J.Extension.JournalCodeLensProvider(ctrl); 
                const sel:vscode.DocumentSelector = { scheme: 'file', language: 'markdown' };

                context.subscriptions.push( 
                    vscode.languages.registerCodeLensProvider(sel,codeLensProvider)
                    ); 

                resolve(ctrl); 
            } catch (error) {
                reject(error); 
            }
       

        });
    }


    public async registerCommands(ctrl: J.Util.Ctrl, context: vscode.ExtensionContext): Promise<J.Util.Ctrl> {
        return Q.Promise<J.Util.Ctrl>((resolve, reject) => {
            ctrl.logger.trace("Entering registerCommands() in util/startup.ts"); 

            let commands = new J.Extension.JournalCommands(ctrl);

            try {
                context.subscriptions.push(
                    vscode.commands.registerCommand('journal.today', () => {
                        commands.showEntry(0)
                            .catch(error => commands.showError(error));
                    }),
                    vscode.commands.registerCommand('journal.yesterday', () => {
                        commands.showEntry(-1)
                            .catch(error => commands.showError(error)); 
                    }),
                    vscode.commands.registerCommand('journal.tomorrow', () => {
                        commands.showEntry(1)
                            .catch(error => commands.showError(error)); 
                    }),
                    vscode.commands.registerCommand('journal.printTime', () => {
                        commands.printTime()
                            .catch(error => commands.showError(error)); 
                    }),
                    vscode.commands.registerCommand('journal.printDuration', () => {
                        commands.printDuration()
                            .catch(error => commands.showError(error));
                    }),
                    vscode.commands.registerCommand('journal.printSum', () => {
                        commands.printSum()
                            .catch(error => commands.showError(error));
                    }),
                    vscode.commands.registerCommand('journal.day', () => {
                        commands.processInput()
                            .catch(error => {
                                commands.showError(error); 
                            });
                    }),
                    vscode.commands.registerCommand('journal.memo', () => {
                        commands.processInput()
                            .catch(error => commands.showError(error));
                    }),
                    vscode.commands.registerCommand('journal.note', () => {
                        commands.showNote()
                            .catch(error => commands.showError(error));
                    }),
                    vscode.commands.registerCommand('journal.open', () => {
                        commands.loadJournalWorkspace()
                            .catch(error => commands.showError(error));
                    }), 
                    vscode.commands.registerCommand('journal.test', () => {
                        commands.runTestFeature()
                            .catch(error => commands.showError(error));
                    })
                    /* vscode.commands.registerCommand('journal.config', () => {
                         _commands.editJournalConfiguration();
                     }), */
                );

                resolve(ctrl);

            } catch (error) {
                reject(error);
            }

        });

    }



    /**
     * Sets default syntax highlighting settings on startup, we try to differentiate between dark and light themes
     *
     * @param {J.Util.Ctrl} ctrl
     * @param {vscode.ExtensionContext} context
     * @returns {Q.Promise<J.Util.Ctrl>}
     * @memberof Startup
     */
    public async registerSyntaxHighlighting(ctrl: J.Util.Ctrl): Promise<J.Util.Ctrl> {

        return Q.Promise<J.Util.Ctrl>((resolve, reject) => {

            // check if current theme is dark, light or highcontrast
            let style: string = ""; 
            let theme: string | undefined = vscode.workspace.getConfiguration().get<string>("workbench.colorTheme"); 
            if(J.Util.isNullOrUndefined(theme) || theme!.search('Light')> -1) { style = "light"; } 
            else if(theme!.search('High Contrast') > -1) { style = "high-contrast"; } 
            else { style = "dark"; } 
            



            let tokenColorCustomizations: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('editor.tokenColorCustomizations');

            if(tokenColorCustomizations.has("textMateRules")) {
                // user customized the section, we do nothing 
                resolve(ctrl); 
            }

            else {
                // we don't change the style in high contrast mode
                if(style.startsWith("high-contrast")) { resolve(ctrl); }

                // no custom rules set by user, we add predefined syntax colors from extension
                let ext: vscode.Extension<any> | undefined = vscode.extensions.getExtension("pajoma.vscode-journal");
                if(J.Util.isNullOrUndefined(ext)) { throw Error("Failed to load this extension"); }

                let colorConfigDir: string = Path. resolve(ext!.extensionPath, "res", "colors");
                
                Q.nfcall<Buffer>(fs.readFile, Path.join(colorConfigDir, style+".json"), "utf-8")
                    .then( (data) =>  {
                        // convert inmutable config object to json mutable object
                        // FIXME: this is a workaround, since we can't simply inject the textMateRules here (not registered configuration)
                        let existingConfig = vscode.workspace.getConfiguration('editor').get('tokenColorCustomizations'); 
                        let mutableExistingConfig = JSON.parse(JSON.stringify(existingConfig)); 

                        // inject our rules
                        let rules: any[] = JSON.parse(data.toString()); 
                        mutableExistingConfig.textMateRules = rules; 

                        // overwrite config with new config
                        return vscode.workspace.getConfiguration("editor").update("tokenColorCustomizations", mutableExistingConfig, vscode.ConfigurationTarget.Global);

                        /*
                        let existingRules: any[] = tokenColorCustomizations.get("textMateRules"); 
                        if(! isNullOrUndefined(existingRules)) rules = rules.concat(existingRules); 
                        let a = vscode.workspace.getConfiguration('editor').inspect('tokenColorCustomizations'); 
                        a.globalValue = rules; 
                        console.log(JSON.stringify(a)); 
                        console.log(JSON.stringify(tokenColorCustomizations)); 
                        // a.inspect("textMateRules").globalValue = rules; 
                        tokenColorCustomizations.inspect("textMateRules").globalValue = rules; 
                        console.log(JSON.stringify(rules)); 
                        console.log(JSON.stringify(tokenColorCustomizations)); 
                        return vscode.workspace.getConfiguration("editor").update("tokenColorCustomizations", tokenColorCustomizations, vscode.ConfigurationTarget.Global);
                        */
                        // return tokenColorCustomizations.update("textMateRules", rules, vscode.ConfigurationTarget.Global); 

                        // return vscode.workspace.getConfiguration("editor.tokenColorCustomizations").update("textMateRules", rules, vscode.ConfigurationTarget.Global)
                        // return tokenColorCustomizations.update("textMateRules", rules, vscode.ConfigurationTarget.Global)

                        // return vscode.workspace.getConfiguration("editor").update("tokenColorCustomizations", tokenColorCustomizations, vscode.ConfigurationTarget.Global)
                    }, error => reject(error))

                    .then(() => resolve(ctrl))
                    .catch(error => reject(error))
                    .done(); 
                

            }
        });

    }


    /*
    
        "editor.tokenColorCustomizations": {
            "textMateRules": [
                {
                    "scope": "text.html.markdown.journal.task.open.bullet", 
                    "settings": {
                        "foreground": "#FF0000",
                        "fontStyle": "bold"
                    }, 
                }, {
                    "scope": "text.html.markdown.journal.task.open.marker", 
                    "settings": {
                        "foreground": "#FFFF00",
                        "fontStyle": "bold"
                    }
                }, 
                {
                    "scope": "text.html.markdown.journal.task.open.bullet", 
                    "settings": {
                        "foreground": "#FF0000",
                        "fontStyle": "bold"
                    }, 
                },
            ]
        },*/

}