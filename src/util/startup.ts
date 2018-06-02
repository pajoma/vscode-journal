import { Util } from './../util.old/util';
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

export class Startup {
    private progress: Q.Deferred<boolean>;
    private main: J.Journal;

    /**
     *
     */
    constructor(public context: vscode.ExtensionContext, public config: vscode.WorkspaceConfiguration) {
        this.progress = Q.defer<boolean>();

    }

    public setFinished(): Q.Promise<boolean> {
        this.progress.resolve(true);
        console.timeEnd("startup")

        return this.progress.promise;
    }

    public asPromise(): Q.Promise<boolean> {
        return this.progress.promise;
    }


    public initialize(): Q.Promise<J.Util.Ctrl> {
        return Q.Promise<J.Util.Ctrl>((resolve, reject) => {
            try {
                let ctrl = new J.Util.Ctrl(this.config); 
                J.Util.DEV_MODE = ctrl.config.isDevelopmentModeEnabled(); 

                if(ctrl.config.isDevelopmentModeEnabled()) J.Util.debug("Development Mode is enabled, Debugging is activated.")

                resolve(ctrl);
            } catch (error) {
                reject(error);
            }
        });
    }


    public registerCommands(ctrl: J.Util.Ctrl, context: vscode.ExtensionContext): Q.Promise<J.Util.Ctrl> {
        return Q.Promise<J.Util.Ctrl>((resolve, reject) => {
            let commands = new J.Extension.JournalCommands(ctrl);

            try {
                context.subscriptions.push(
                    vscode.commands.registerCommand('journal.today', () => {
                        commands.showEntry(0)
                            .catch(error => commands.showError(error))
                            .done(); 
                    }),
                    vscode.commands.registerCommand('journal.yesterday', () => {
                        commands.showEntry(-1)
                            .catch(error => commands.showError(error))
                            .done(); 
                    }),
                    vscode.commands.registerCommand('journal.tomorrow', () => {
                        commands.showEntry(1)
                            .catch(error => commands.showError(error))
                            .done(); 
                    }),
                    vscode.commands.registerCommand('journal.day', () => {
                        commands.processInput()
                            .catch(error => commands.showError(error))
                            .done(); 
                    }),
                    vscode.commands.registerCommand('journal.memo', () => {
                        commands.processInput()
                            .catch(error => commands.showError(error))
                            .done(); 
                    }),
                    vscode.commands.registerCommand('journal.note', () => {
                        commands.showNote()
                            .catch(error => commands.showError(error))
                            .done(); 
                    }),
                    vscode.commands.registerCommand('journal.open', () => {
                        commands.loadJournalWorkspace()
                            .catch(error => commands.showError(error))
                            .done(); 
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



}