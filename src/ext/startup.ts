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
import { TextMateRule } from '../model/vscode';
import { isNullOrUndefined } from '../util';

export class Startup {

    private ctrl: J.Util.Ctrl;

    constructor(public config: vscode.WorkspaceConfiguration) {
        this.ctrl = new J.Util.Ctrl(this.config);
    }


    public async run(context: vscode.ExtensionContext): Promise<void> {

        this.initialize()
            .then(() => this.registerLoggingChannel(this.ctrl, context))
            .then(() => this.registerCommands(this.ctrl, context))
            .then(() => this.registerCodeActions(this.ctrl, context))
            .then(() => this.registerSyntaxHighlighting(this.ctrl))
            .then(() => this.registerCacheInvalidation(this.ctrl, context))

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

    public async registerLoggingChannel(ctrl: J.Util.Ctrl, context: vscode.ExtensionContext): Promise<J.Util.Ctrl> {
        const channel: vscode.OutputChannel = vscode.window.createOutputChannel("Journal");
        context.subscriptions.push(channel);
        ctrl.logger = new J.Util.ConsoleLogger(ctrl, channel);
        ctrl.logger.debug("VSCode Journal is starting");
        return ctrl;
    }

    /**
     * Planned for 0.13
     * 
     * @param ctrl 
     * @param context 
     * @returns 
     */
    public async registerCodeLens(ctrl: J.Util.Ctrl, context: vscode.ExtensionContext): Promise<J.Util.Ctrl> {
        const sel: vscode.DocumentSelector = { scheme: 'file', language: 'markdown' };
        context.subscriptions.push(
            vscode.languages.registerCodeLensProvider(sel, new J.Provider.MigrateTasksCodeLens(ctrl))
        );
        return ctrl;
    }

    public async registerCommands(ctrl: J.Util.Ctrl, context: vscode.ExtensionContext): Promise<void> {
        ctrl.logger.trace("Entering registerCommands() in util/startup.ts");


        try {
            ctrl.reader.onNotesInjected = (doc, date) => {
                new J.Provider.SyncNoteLinks(ctrl).injectAttachementLinks(doc, date)
                    .finally(() => ctrl.logger.trace("Scanning notes completed"));
            };

            const syncDailyLinks = new J.Provider.SyncDailyLinks(ctrl);
            const weeklyEntryWatcher = new J.Provider.WeeklyEntryWatcher(ctrl, syncDailyLinks);
            context.subscriptions.push(weeklyEntryWatcher);

            context.subscriptions.push(
                J.Provider.Commands.OpenJournalWorkspaceCommand.create(ctrl),
                J.Provider.Commands.PrintTimeCommand.create(ctrl),
                J.Provider.Commands.PrintSumCommand.create(ctrl),
                J.Provider.Commands.PrintDurationCommand.create(ctrl),
                J.Provider.Commands.ShowEntryForInputCommand.create(ctrl),
                vscode.commands.registerCommand('journal.memo', () =>
                    new J.Provider.Commands.ShowEntryForInputCommand(ctrl).execute()),
                J.Provider.Commands.ShowEntryForTodayCommand.create(ctrl),
                J.Provider.Commands.ShowEntryForTomorrowCommand.create(ctrl),
                J.Provider.Commands.ShowEntryForYesterdayCommand.create(ctrl),
                J.Provider.Commands.ShowNoteCommand.create(ctrl),
                J.Provider.Commands.ShiftTaskCommand.create(ctrl),
                J.Provider.Commands.OpenPreviousEntryCommand.create(ctrl),
                J.Provider.Commands.OpenNextEntryCommand.create(ctrl)
            );

        } catch (error) {
            console.error("Failed to register commands, reason: ", error);
            throw error;
        }

    }

    public async registerCacheInvalidation(ctrl: J.Util.Ctrl, context: vscode.ExtensionContext): Promise<void> {
        try {
            const scanner = ctrl.ui.getScanner();
            context.subscriptions.push(...scanner.registerInvalidationListeners());
        } catch (error) {
            ctrl.logger.error("Failed to register cache invalidation listeners, reason: ", error);
        }
    }

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


    getConfiguration(): J.Extension.Configuration {
        return this.ctrl.config;
    }


    public getJournalController() {
        return this.ctrl;
    }


    public async registerSyntaxHighlighting(ctrl: J.Util.Ctrl): Promise<J.Util.Ctrl> {
        if (this.ctrl.config.isSyntaxHighlightingEnabled()) {
            return this.enableSyntaxHighlighting(ctrl);
        } else {
            return this.disableSyntaxHighlighting(ctrl);
        }
    }


    public async disableSyntaxHighlighting(ctrl: J.Util.Ctrl): Promise<J.Util.Ctrl> {
        const tokenColorCustomizations = vscode.workspace.getConfiguration('editor.tokenColorCustomizations');
        if (!tokenColorCustomizations.has("textMateRules")) { return ctrl; }

        const rules: TextMateRule[] = tokenColorCustomizations.get<TextMateRule[]>("textMateRules")!;
        const result: TextMateRule[] = rules.filter(rule => !rule.scope.includes("journal"));
        await vscode.workspace.getConfiguration().update("editor.tokenColorCustomizations", { "textMateRules": result }, vscode.ConfigurationTarget.Global);
        return ctrl;
    }


    /**
     * Sets default syntax highlighting settings on startup, we try to differentiate between dark and light themes
     *
     * @param {J.Util.Ctrl} ctrl
     * @param {vscode.ExtensionContext} context
     * @returns {Q.Promise<J.Util.Ctrl>}
     * @memberof Startup
     */
    public async enableSyntaxHighlighting(ctrl: J.Util.Ctrl): Promise<J.Util.Ctrl> {
        const theme: string | undefined = vscode.workspace.getConfiguration().get<string>("workbench.colorTheme");
        let style: string;
        if (J.Util.isNullOrUndefined(theme) || theme!.search('Light') > -1) { style = "light"; }
        else if (theme!.search('High Contrast') > -1) { style = "high-contrast"; }
        else { style = "dark"; }

        const tokenColorCustomizations: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('editor.tokenColorCustomizations');
        const rules: TextMateRule[] | undefined = tokenColorCustomizations.get<TextMateRule[]>("textMateRules");

        if (isNullOrUndefined(rules) || rules!.length > 0) {
            return ctrl;
        }

        if (style.startsWith("high-contrast")) { return ctrl; }

        const ext: vscode.Extension<any> | undefined = vscode.extensions.getExtension("pajoma.vscode-journal");
        if (J.Util.isNullOrUndefined(ext)) { throw Error("Failed to load this extension"); }

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