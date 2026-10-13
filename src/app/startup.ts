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
import { ConsoleLogger } from '../shared/logging/logger';
import { Configuration } from '../shared/config/configuration';
import { IWorkspaceConfigReader } from '../shared/model/index';
import { Container } from './container';
import { registerCacheInvalidation, registerCodeActions, registerCommands } from './register';
import { refreshScopeFolders } from '../features/scopes/scope-folders';
import { withoutInjectedRules } from './injected-colors';

/**
 * Extension lifecycle entry point. Builds the {@link Container} (composition
 * root) in a single pass, then registers commands and providers.
 */
export class Startup {

    private ctrl!: Container;

    constructor(public config: IWorkspaceConfigReader) { }

    public async run(context: vscode.ExtensionContext): Promise<void> {
        try {
            const channel = vscode.window.createOutputChannel("Journal");
            context.subscriptions.push(channel);

            this.ctrl = new Container(this.config, (cfg) => new ConsoleLogger(cfg, channel));
            this.ctrl.logger.debug("VSCode Journal is starting");

            if (this.ctrl.config.isDevelopmentModeEnabled()) {
                console.log("Development Mode for Journal extension is enabled, Tracing in Console and Output is activated.");
            }

            // scope folders must be known before the first note command runs
            await refreshScopeFolders(this.ctrl).catch(err => this.ctrl.logger.error("Failed to scan scope folders.", err));
            registerCommands(this.ctrl, context);
            registerCodeActions(this.ctrl, context);
            await this.removeInjectedColors().catch(err => this.ctrl.logger.error("Failed to remove the old task colors from the user settings.", err));
            registerCacheInvalidation(this.ctrl, context);

            console.timeEnd("startup");
            console.log("VSCode-Journal extension was successfully initialized.");
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    public getConfiguration(): Configuration {
        return this.ctrl.config;
    }

    public getJournalController(): Container {
        return this.ctrl;
    }

    /**
     * Versions up to 1.0 wrote task colors into the user settings, fixed to the
     * theme at the time. Task colors now come from the theme, through the
     * grammar's standard scopes (#44); remove what those versions wrote.
     */
    private async removeInjectedColors(): Promise<void> {
        const editor = vscode.workspace.getConfiguration('editor');
        const current = editor.inspect<Record<string, unknown>>('tokenColorCustomizations')?.globalValue;
        const cleaned = withoutInjectedRules(current);
        if (cleaned !== current) {
            await editor.update('tokenColorCustomizations', cleaned, vscode.ConfigurationTarget.Global);
            this.ctrl.logger.debug("Removed the task colors that older versions wrote into the user settings.");
        }
    }
}
