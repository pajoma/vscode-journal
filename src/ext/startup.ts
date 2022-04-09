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
import * as J from '..';
import * as Path from 'path';
import * as fs from 'fs';

export class Startup {

    private ctrl: J.Util.Ctrl;

    constructor(public config: vscode.WorkspaceConfiguration) {
        this.ctrl = new J.Util.Ctrl(this.config);
    }


    public async run(context: vscode.ExtensionContext): Promise<void> {

        this.initialize()
            .then(() => this.registerLoggingChannel(this.ctrl, context))
            .then(() => this.registerCommands(this.ctrl, context))
            .then(() => this.registerCodeLens(this.ctrl, context))
            .then(() => this.registerCodeActions(this.ctrl, context))
            .then(() => this.registerSyntaxHighlighting(this.ctrl))

            .then((ctrl) => {
                console.timeEnd("startup");
                console.log("VSCode-Journal extension was successfully initialized.");
            })
            .catch((error) => {
                console.error(error);
                throw error;
            });
    }


    private async initialize(): Promise<void> {
        try {

            if (this.ctrl.config.isDevelopmentModeEnabled() === true) {
                console.log("Development Mode for Journal extension is enabled, Tracing in Console and Output is activated.");
            }
            return;
        } catch (error) {
            console.error("Failed to initialize journal, reason: ", error);
            throw error;
        }
    }

    public registerLoggingChannel(ctrl: J.Util.Ctrl, context: vscode.ExtensionContext): Promise<J.Util.Ctrl> {
        return new Promise<J.Util.Ctrl>((resolve, reject) => {
            try {
                let channel: vscode.OutputChannel = vscode.window.createOutputChannel("Journal");
                context.subscriptions.push(channel);
                ctrl.logger = new J.Util.ConsoleLogger(ctrl, channel);
                ctrl.logger.debug("VSCode Journal is starting");

                resolve(ctrl);
            } catch (error) {
                reject(error);
            }


        });
    }

    public registerCodeLens(ctrl: J.Util.Ctrl, context: vscode.ExtensionContext): Promise<J.Util.Ctrl> {
        return new Promise<J.Util.Ctrl>((resolve, reject) => {
            try {
                const sel: vscode.DocumentSelector = { scheme: 'file', language: 'markdown' };

                context.subscriptions.push(
                    vscode.languages.registerCodeLensProvider(sel, new J.Provider.MigrateTasksCodeLens(ctrl))
                );

                resolve(ctrl);
            } catch (error) {
                this.ctrl.logger.error("Failed to register code lens, reason: ", error);
                reject(error);
            }


        });
    }

    public async registerCommands(ctrl: J.Util.Ctrl, context: vscode.ExtensionContext): Promise<void> {
        ctrl.logger.trace("Entering registerCommands() in util/startup.ts");


        try {
            context.subscriptions.push(
                J.Provider.Commands.OpenJournalWorkspaceCommand.create(ctrl),
                J.Provider.Commands.PrintTimeCommand.create(ctrl),
                J.Provider.Commands.PrintSumCommand.create(ctrl),
                J.Provider.Commands.PrintDurationCommand.create(ctrl),
                J.Provider.Commands.ShowEntryForInputCommand.create(ctrl),
                J.Provider.Commands.ShowEntryForTodayCommand.create(ctrl),
                J.Provider.Commands.ShowEntryForTomorrowCommand.create(ctrl),
                J.Provider.Commands.ShowEntryForYesterdayCommand.create(ctrl),
                J.Provider.Commands.ShowNoteCommand.create(ctrl),
                J.Provider.Commands.InsertMemoCommand.create(ctrl),
                J.Provider.Commands.ShiftTaskCommand.create(ctrl)
            );

        } catch (error) {
            console.error("Failed to register commands, reason: ", error);
            throw error;
        }

    }
    /*
    public registerCommandsOld(ctrl: J.Util.Ctrl, context: vscode.ExtensionContext): Promise<J.Util.Ctrl> {
        return new Promise<J.Util.Ctrl>((resolve, reject) => {
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
                     }), 
                );

                resolve(ctrl);

            } catch (error) {
                reject(error);
            }

        });

    }

*/
    public async registerCodeActions(ctrl: J.Util.Ctrl, context: vscode.ExtensionContext): Promise<void> {
        try {

            // TODO: add filters only for configured base directories
            const sel: vscode.DocumentSelector = { scheme: 'file', language: 'markdown' };

            context.subscriptions.push(
                vscode.languages.registerCodeActionsProvider(sel, new J.Provider.CompletedTaskActions(ctrl)),
                vscode.languages.registerCodeActionsProvider(sel, new J.Provider.OpenTaskActions(ctrl))
            );

        } catch (error) {
            console.error("Failed to register code actions, reason: ", error);
            throw error;
        }

    }


    getConfiguration() : J.Extension.Configuration {
        return this.ctrl.configuration;
    }


    public getJournalController() {
        return this.ctrl;
    }



    /**
     * Sets default syntax highlighting settings on startup, we try to differentiate between dark and light themes
     *
     * @param {J.Util.Ctrl} ctrl
     * @param {vscode.ExtensionContext} context
     * @returns {Q.Promise<J.Util.Ctrl>}
     * @memberof Startup
     */
    public registerSyntaxHighlighting(ctrl: J.Util.Ctrl): Promise<J.Util.Ctrl> {

        return new Promise<J.Util.Ctrl>((resolve, reject) => {

            // check if current theme is dark, light or highcontrast
            let style: string = "";
            let theme: string | undefined = vscode.workspace.getConfiguration().get<string>("workbench.colorTheme");
            if (J.Util.isNullOrUndefined(theme) || theme!.search('Light') > -1) { style = "light"; }
            else if (theme!.search('High Contrast') > -1) { style = "high-contrast"; }
            else { style = "dark"; }




            let tokenColorCustomizations: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('editor.tokenColorCustomizations');

            if (tokenColorCustomizations.has("textMateRules")) {
                // user customized the section, we do nothing 
                resolve(ctrl);
            }

            else {
                // we don't change the style in high contrast mode
                if (style.startsWith("high-contrast")) { resolve(ctrl); }

                // no custom rules set by user, we add predefined syntax colors from extension
                let ext: vscode.Extension<any> | undefined = vscode.extensions.getExtension("pajoma.vscode-journal");
                if (J.Util.isNullOrUndefined(ext)) { throw Error("Failed to load this extension"); }

                let colorConfigDir: string = Path.resolve(ext!.extensionPath, "res", "colors");

                fs.promises.readFile(Path.join(colorConfigDir, style + ".json"), { encoding: "utf-8" })
                    .then((data) => {
                        // convert inmutable config object to json mutable object
                        // FIXME: this is a workaround, since we can't simply inject the textMateRules here (not registered configuration)
                        let existingConfig = vscode.workspace.getConfiguration('editor').get('tokenColorCustomizations');
                        let mutableExistingConfig = JSON.parse(JSON.stringify(existingConfig));

                        // inject our rules
                        let rules: any[] = JSON.parse(data.toString());
                        mutableExistingConfig.textMateRules = rules;

                        // overwrite config with new config
                        return vscode.workspace.getConfiguration("editor").update("tokenColorCustomizations", mutableExistingConfig, vscode.ConfigurationTarget.Global);

                    }, error => reject(error))

                    .then(() => resolve(ctrl))
                    .catch(error => reject(error));


            }
        });

    }


}