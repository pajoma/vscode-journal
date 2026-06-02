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
import * as Path from 'path';
import { isNullOrUndefined, ConsoleLogger } from '../shared/index';
import { Configuration } from '../shared/config/configuration';
import { Container } from './container';
import { registerCacheInvalidation, registerCodeActions, registerCommands } from './register';

interface TextMateRule { scope: string; settings: any; }

/**
 * Extension lifecycle entry point. Builds the {@link Container} (composition
 * root) in a single pass, then registers commands, providers and optional
 * syntax highlighting.
 */
export class Startup {

    private ctrl!: Container;

    constructor(public config: vscode.WorkspaceConfiguration) { }

    public async run(context: vscode.ExtensionContext): Promise<void> {
        try {
            const channel = vscode.window.createOutputChannel("Journal");
            context.subscriptions.push(channel);

            this.ctrl = new Container(this.config, (cfg) => new ConsoleLogger(cfg, channel));
            this.ctrl.logger.debug("VSCode Journal is starting");

            if (this.ctrl.config.isDevelopmentModeEnabled()) {
                console.log("Development Mode for Journal extension is enabled, Tracing in Console and Output is activated.");
            }

            registerCommands(this.ctrl, context);
            registerCodeActions(this.ctrl, context);
            await this.registerSyntaxHighlighting(this.ctrl);
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

    public async registerSyntaxHighlighting(ctrl: Container): Promise<Container> {
        if (this.ctrl.config.isSyntaxHighlightingEnabled()) {
            return this.enableSyntaxHighlighting(ctrl);
        } else {
            return this.disableSyntaxHighlighting(ctrl);
        }
    }

    public async disableSyntaxHighlighting(ctrl: Container): Promise<Container> {
        const tokenColorCustomizations = vscode.workspace.getConfiguration('editor.tokenColorCustomizations');
        if (!tokenColorCustomizations.has("textMateRules")) { return ctrl; }

        const rules: TextMateRule[] = tokenColorCustomizations.get<TextMateRule[]>("textMateRules")!;
        const result: TextMateRule[] = rules.filter(rule => !rule.scope.includes("journal"));
        await vscode.workspace.getConfiguration().update("editor.tokenColorCustomizations", { "textMateRules": result }, vscode.ConfigurationTarget.Global);
        return ctrl;
    }

    /**
     * Sets default syntax highlighting settings on startup, we try to differentiate between dark and light themes
     */
    public async enableSyntaxHighlighting(ctrl: Container): Promise<Container> {
        const theme: string | undefined = vscode.workspace.getConfiguration().get<string>("workbench.colorTheme");
        let style: string;
        if (isNullOrUndefined(theme) || theme!.search('Light') > -1) { style = "light"; }
        else if (theme!.search('High Contrast') > -1) { style = "high-contrast"; }
        else { style = "dark"; }

        const tokenColorCustomizations: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('editor.tokenColorCustomizations');
        const rules: TextMateRule[] | undefined = tokenColorCustomizations.get<TextMateRule[]>("textMateRules");

        if (isNullOrUndefined(rules) || rules!.length > 0) {
            return ctrl;
        }

        if (style.startsWith("high-contrast")) { return ctrl; }

        const ext: vscode.Extension<any> | undefined = vscode.extensions.getExtension("pajoma.vscode-journal");
        if (isNullOrUndefined(ext)) { throw Error("Failed to load this extension"); }

        const colorConfigDir: string = Path.join(ext!.extensionPath, "res", "colors");
        const rawData = await vscode.workspace.fs.readFile(vscode.Uri.file(Path.join(colorConfigDir, style + ".json")));
        const data = Buffer.from(rawData).toString('utf-8');

        // FIXME: this is a workaround, since we can't simply inject the textMateRules here (not registered configuration)
        const existingConfig = vscode.workspace.getConfiguration('editor').get('tokenColorCustomizations');
        const mutableExistingConfig = JSON.parse(JSON.stringify(existingConfig));
        mutableExistingConfig.textMateRules = JSON.parse(data);
        await vscode.workspace.getConfiguration("editor").update("tokenColorCustomizations", mutableExistingConfig, vscode.ConfigurationTarget.Global);

        return ctrl;
    }
}
