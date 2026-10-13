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
import * as fs from 'fs';
import * as Path from 'path';
import { JournalController } from '../../../shared/model/index';
import { codexToml, launcherCommand, McpClient, mcpServersJson, setupCommand } from '../mcp-files';
import { McpFiles } from '../mcp-server';

type Choice = McpClient | 'copilot';

/**
 * Shows how to connect an assistant to the journal MCP server (#292): Copilot
 * needs nothing, Claude Code and Codex get the line to run (run in a terminal
 * on request), other clients the JSON block for their configuration. Never
 * writes another client's configuration itself.
 */
export class SetupMcpCommand implements vscode.Command, vscode.Disposable {
    title: string = 'Set up MCP Server';
    command: string = 'journal.setupMcp';

    protected constructor(public ctrl: JournalController, private readonly files: McpFiles) { }

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: JournalController, files: McpFiles): vscode.Disposable {
        const cmd = new this(ctrl, files);
        vscode.commands.registerCommand(cmd.command, (client?: Choice) => cmd.execute(client));
        return cmd;
    }

    public async execute(client?: Choice): Promise<void> {
        this.ctrl.logger.trace("Executing command: ", this.command);
        try {
            const choice = client ?? await this.pickClient();
            if (choice === undefined || !await this.enable()) { return; }
            await this.files.refresh();
            switch (choice) {
                case 'copilot': return await this.copilot();
                case 'claude': return await this.cli('claude');
                case 'codex': return await this.cli('codex');
                case 'other': return await this.other();
            }
        } catch (error) {
            this.ctrl.logger.error("Failed to execute command: ", this.command, "Reason: ", error);
            this.ctrl.ui.showError("Failed to set up the MCP server.");
        }
    }

    private async pickClient(): Promise<Choice | undefined> {
        const items: (vscode.QuickPickItem & { client: Choice })[] = [
            { label: 'Claude Code', client: 'claude', description: vscode.l10n.t("CLI and VS Code extension") },
            { label: 'Codex', client: 'codex', description: vscode.l10n.t("CLI, IDE extension and app") },
            { label: 'GitHub Copilot', client: 'copilot', description: vscode.l10n.t("agent mode in VS Code") },
            { label: vscode.l10n.t("Other MCP clients"), client: 'other', description: "Claude Desktop, Cursor, Gemini CLI, …" },
        ];
        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: vscode.l10n.t("Which assistant should use your journal?"),
        });
        return picked?.client;
    }

    /** The server only starts with `journal.mcp.enabled` on; asks to turn it on. */
    private async enable(): Promise<boolean> {
        if (this.files.enabled) { return true; }
        const turnOn = vscode.l10n.t("Turn On");
        const answer = await vscode.window.showInformationMessage(
            vscode.l10n.t("The journal MCP server is turned off. Turn it on, so assistants can read and write your journal?"),
            { modal: true, detail: vscode.l10n.t("Sets journal.mcp.enabled in your user settings. Turn it off there to stop the server for every assistant.") },
            turnOn);
        if (answer !== turnOn) { return false; }
        await vscode.workspace.getConfiguration('journal').update('mcp.enabled', true, vscode.ConfigurationTarget.Global);
        return true;
    }

    private async copilot(): Promise<void> {
        const show = vscode.l10n.t("Show MCP Servers");
        const answer = await vscode.window.showInformationMessage(
            vscode.l10n.t("Copilot finds the journal MCP server without any setup. Start it from the list of MCP servers."), show);
        if (answer === show) { await vscode.commands.executeCommand('workbench.mcp.listServer'); }
    }

    private async cli(client: 'claude' | 'codex'): Promise<void> {
        const platform = process.platform;
        const line = setupCommand(client, platform, this.files.launcher);
        const installed = onPath(client, platform);
        const run = vscode.l10n.t("Run in Terminal");
        const copy = vscode.l10n.t("Copy Command");
        const copyToml = vscode.l10n.t("Copy config.toml Block");

        const notes: string[] = [];
        if (!installed) {
            notes.push(vscode.l10n.t("The {0} command was not found. Run the line in a terminal where it is installed.", client));
        }
        if (client === 'claude') {
            const { command, args } = launcherCommand(platform, this.files.launcher);
            notes.push(vscode.l10n.t("Or type /mcp in the Claude Code chat panel and add a server named \"journal\" with the command: {0}", [command, ...args].join(' ')));
        } else {
            notes.push(vscode.l10n.t("Or add the block to ~/.codex/config.toml. The Codex CLI, IDE extension and app share this configuration."));
        }

        const buttons = [...(installed ? [run] : []), copy, ...(client === 'codex' ? [copyToml] : [])];
        const answer = await vscode.window.showInformationMessage(
            vscode.l10n.t("Connect {0} to your journal with this command:", client === 'claude' ? 'Claude Code' : 'Codex'),
            { modal: true, detail: [line, '', ...notes].join('\n') }, ...buttons);

        if (answer === run) {
            const terminal = vscode.window.createTerminal('Journal MCP');
            terminal.show();
            terminal.sendText(line);
        } else if (answer === copy) {
            await this.copy(line);
        } else if (answer === copyToml) {
            await this.copy(codexToml(platform, this.files.launcher));
        }
    }

    private async other(): Promise<void> {
        const json = mcpServersJson(process.platform, this.files.launcher);
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ language: 'json', content: json }));
        await this.copy(json);
    }

    private async copy(text: string): Promise<void> {
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage(vscode.l10n.t("Copied to the clipboard."));
    }
}

/** Whether a command is on the PATH VS Code sees. */
function onPath(command: string, platform: NodeJS.Platform): boolean {
    const extensions = platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
    return (process.env.PATH ?? '').split(Path.delimiter).filter(Boolean).some(dir =>
        extensions.some(ext => {
            try {
                return fs.statSync(Path.join(dir, command + ext)).isFile();
            } catch {
                return false;
            }
        }));
}
