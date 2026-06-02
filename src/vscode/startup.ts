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
import { OpenJournalWorkspaceCommand, OpenNextEntryCommand, OpenPreviousEntryCommand, PrintDurationCommand, PrintSumCommand, PrintTimeCommand, ShiftTaskCommand, ShowEntryForInputCommand, ShowEntryForTodayCommand, ShowEntryForTomorrowCommand, ShowEntryForYesterdayCommand, ShowNoteCommand } from '../commands';
import { SyncDailyLinks, SyncNoteLinks, WeeklyEntryWatcher } from '../features';
import { CompletedTaskActions, MigrateTasksCodeLens, OpenTaskActions } from '../ui';
import { ConsoleLogger, Ctrl, isNullOrUndefined } from '../util';
import { Configuration } from './';
import * as Path from 'path';

interface TextMateRule { scope: string; settings: any; }

export class Startup {

    private ctrl: Ctrl;

    constructor(public config: vscode.WorkspaceConfiguration) {
        this.ctrl = new Ctrl(this.config);
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

    public async registerLoggingChannel(ctrl: Ctrl, context: vscode.ExtensionContext): Promise<Ctrl> {
        const channel: vscode.OutputChannel = vscode.window.createOutputChannel("Journal");
        context.subscriptions.push(channel);
        const logger = new ConsoleLogger(ctrl.config, channel);
        ctrl.initServices(logger);
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
    public async registerCodeLens(ctrl: Ctrl, context: vscode.ExtensionContext): Promise<Ctrl> {
        const sel: vscode.DocumentSelector = { scheme: 'file', language: 'markdown' };
        context.subscriptions.push(
            vscode.languages.registerCodeLensProvider(sel, new MigrateTasksCodeLens(ctrl))
        );
        return ctrl;
    }

    public async registerCommands(ctrl: Ctrl, context: vscode.ExtensionContext): Promise<void> {
        ctrl.logger.trace("Entering registerCommands() in util/startup.ts");


        try {
            ctrl.reader.onNotesInjected = (doc, date) => {
                new SyncNoteLinks(ctrl).injectAttachmentLinks(doc, date)
                    .finally(() => ctrl.logger.trace("Scanning notes completed"));
            };

            const syncDailyLinks = new SyncDailyLinks(ctrl);
            const weeklyEntryWatcher = new WeeklyEntryWatcher(ctrl, syncDailyLinks);
            context.subscriptions.push(weeklyEntryWatcher);

            context.subscriptions.push(
                OpenJournalWorkspaceCommand.create(ctrl),
                PrintTimeCommand.create(ctrl),
                PrintSumCommand.create(ctrl),
                PrintDurationCommand.create(ctrl),
                ShowEntryForInputCommand.create(ctrl),
                vscode.commands.registerCommand('journal.memo', () =>
                    new ShowEntryForInputCommand(ctrl).execute()),
                ShowEntryForTodayCommand.create(ctrl),
                ShowEntryForTomorrowCommand.create(ctrl),
                ShowEntryForYesterdayCommand.create(ctrl),
                ShowNoteCommand.create(ctrl),
                ShiftTaskCommand.create(ctrl),
                OpenPreviousEntryCommand.create(ctrl),
                OpenNextEntryCommand.create(ctrl)
            );

        } catch (error) {
            console.error("Failed to register commands, reason: ", error);
            throw error;
        }

    }

    public async registerCacheInvalidation(ctrl: Ctrl, context: vscode.ExtensionContext): Promise<void> {
        try {
            const scanner = ctrl.ui.getScanner();
            context.subscriptions.push(...scanner.registerInvalidationListeners());
        } catch (error) {
            ctrl.logger.error("Failed to register cache invalidation listeners, reason: ", error);
        }
    }

    public async registerCodeActions(ctrl: Ctrl, context: vscode.ExtensionContext): Promise<void> {
        try {

            // TODO: add filters only for configured base directories
            const sel: vscode.DocumentSelector = { scheme: 'file', language: 'markdown' };

            context.subscriptions.push(
                vscode.languages.registerCodeActionsProvider(sel, new CompletedTaskActions(ctrl)),
                vscode.languages.registerCodeActionsProvider(sel, new OpenTaskActions(ctrl))
            );

        } catch (error) {
            console.error("Failed to register code actions, reason: ", error);
            throw error;
        }

    }


    getConfiguration(): Configuration {
        return this.ctrl.config;
    }


    public getJournalController() {
        return this.ctrl;
    }


    public async registerSyntaxHighlighting(ctrl: Ctrl): Promise<Ctrl> {
        if (this.ctrl.config.isSyntaxHighlightingEnabled()) {
            return this.enableSyntaxHighlighting(ctrl);
        } else {
            return this.disableSyntaxHighlighting(ctrl);
        }
    }


    public async disableSyntaxHighlighting(ctrl: Ctrl): Promise<Ctrl> {
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
     * @param {Ctrl} ctrl
     * @param {vscode.ExtensionContext} context
     * @returns {Q.Promise<Ctrl>}
     * @memberof Startup
     */
    public async enableSyntaxHighlighting(ctrl: Ctrl): Promise<Ctrl> {
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