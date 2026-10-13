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
import { createHash } from 'crypto';
import { HostEnvironment } from 'journal-core';
import { launcherName, launcherScript, mainExecutable, SERVER_NAME, serverEnv, settingsFile } from './mcp-files';

/** Where the extension and VS Code put things; a plain value, so tests can use temporary folders. */
export interface McpLocations {
    /** The bundled server in the installed extension (`dist/mcp-server.mjs`). */
    bundledServer: string;
    /** `context.globalStorageUri`: keeps its path across updates of the extension and of VS Code. */
    globalStorage: string;
    /** `context.storageUri` (this workspace), undefined without a workspace. */
    workspaceStorage: string | undefined;
}

/** The `journal.*` keys of the manifest, without the prefix. */
export function manifestKeys(packageJSON: { contributes?: { configuration?: unknown } }): string[] {
    const configuration = packageJSON.contributes?.configuration;
    const sections = (Array.isArray(configuration) ? configuration : [configuration]) as { properties?: Record<string, unknown> }[];
    return sections.flatMap(s => Object.keys(s?.properties ?? {}))
        .filter(key => key.startsWith('journal.'))
        .map(key => key.slice('journal.'.length));
}

/**
 * The files MCP clients need (#292). Copilot runs the bundled server of the
 * installed extension with this window's settings. External clients (Claude
 * Code, Codex, …) store the path of a start script once; the script, the copy
 * of the server and the settings it reads stay in the global storage, and are
 * rewritten whenever the extension starts, so updates of the extension or of
 * VS Code need no new setup.
 */
export class McpFiles {

    /** Writes run one after the other: a settings change and the setup command can refresh at the same time. */
    private pending: Promise<unknown> = Promise.resolve();

    constructor(
        private readonly locations: McpLocations,
        private readonly keys: string[],
        private readonly host: HostEnvironment,
        private readonly platform: NodeJS.Platform = process.platform,
        private readonly execPath: string = process.execPath,
    ) { }

    /** The start script external clients run. */
    get launcher(): string { return Path.join(this.locations.globalStorage, launcherName(this.platform)); }

    /** The server external clients run: a copy outside the versioned extension folder. */
    get server(): string { return Path.join(this.locations.globalStorage, 'mcp-server.mjs'); }

    /** The settings external clients use: the user settings. */
    get userSettings(): string { return Path.join(this.locations.globalStorage, 'settings.json'); }

    /** The settings Copilot uses: this window's settings, workspace settings included. */
    get windowSettings(): string {
        return Path.join(this.locations.workspaceStorage ?? this.locations.globalStorage, 'mcp-settings.json');
    }

    /** The time zone the server uses for "today": this machine's. */
    get timezone(): string { return Intl.DateTimeFormat().resolvedOptions().timeZone; }

    /** `journal.mcp.enabled`: the server only starts when it is on (#292). */
    get enabled(): boolean {
        return vscode.workspace.getConfiguration('journal').get<boolean>('mcp.enabled', false);
    }

    /**
     * Writes every file whose content changed. The settings are always written:
     * with `journal.mcp.enabled` off, they make a server set up before refuse to start.
     * The copy of the server and the start script are only written when it is on.
     * @returns the content of this window's settings, which identifies the server version Copilot runs
     */
    public refresh(): Promise<string> {
        const next = this.pending.then(() => this.write(), () => this.write());
        this.pending = next;
        return next;
    }

    private async write(): Promise<string> {
        const config = vscode.workspace.getConfiguration('journal');
        const windowSettings = settingsFile(this.keys, key => config.get(key), this.host);
        // user settings only: external clients run outside of any workspace
        const userSettings = settingsFile(this.keys, key => {
            const values = config.inspect(key);
            return values?.globalValue ?? values?.defaultValue;
        }, { language: this.host.language, workspaceRoot: () => '' });

        const executable = mainExecutable(this.execPath, this.platform, dir => fs.readdirSync(dir));
        const script = launcherScript(this.platform, executable, this.server, serverEnv(this.userSettings, this.timezone));

        await fs.promises.mkdir(this.locations.globalStorage, { recursive: true });
        if (this.locations.workspaceStorage) { await fs.promises.mkdir(this.locations.workspaceStorage, { recursive: true }); }
        await writeIfChanged(this.userSettings, Buffer.from(userSettings));
        await writeIfChanged(this.windowSettings, Buffer.from(windowSettings));
        if (this.enabled) {
            await writeIfChanged(this.server, await fs.promises.readFile(this.locations.bundledServer));
            await writeIfChanged(this.launcher, Buffer.from(script));
            if (this.platform !== 'win32') { await fs.promises.chmod(this.launcher, 0o755); }
        }
        return windowSettings;
    }
}

async function writeIfChanged(file: string, content: Buffer): Promise<void> {
    const current = await fs.promises.readFile(file).catch(() => undefined);
    if (!current?.equals(content)) { await fs.promises.writeFile(file, content); }
}

/**
 * Registers the server for Copilot (VS Code's MCP support) and keeps the files
 * of external clients up to date. Copilot only gets the server while
 * `journal.mcp.enabled` is on, and restarts it when the `journal.*` settings
 * change: they are part of the server's version.
 */
export function registerMcpServer(files: McpFiles, locations: McpLocations, version: string, logError: (msg: string, err: unknown) => void): vscode.Disposable {
    const changed = new vscode.EventEmitter<void>();
    const refresh = () => files.refresh().catch(err => {
        logError("Failed to write the files of the MCP server.", err);
        return '';
    });
    let ready = refresh();

    const provider = vscode.lm.registerMcpServerDefinitionProvider(SERVER_NAME, {
        onDidChangeMcpServerDefinitions: changed.event,
        provideMcpServerDefinitions: async () => {
            const settings = await ready;
            if (!files.enabled) { return []; }
            const hash = createHash('sha256').update(settings).digest('hex').slice(0, 8);
            // process.execPath runs as Node with ELECTRON_RUN_AS_NODE, see McpStdioServerDefinition.command
            return [new vscode.McpStdioServerDefinition(
                'Journal', process.execPath, [locations.bundledServer],
                serverEnv(files.windowSettings, files.timezone), `${version}+${hash}`)];
        },
    });

    const watcher = vscode.workspace.onDidChangeConfiguration(event => {
        if (!event.affectsConfiguration('journal')) { return; }
        ready = refresh();
        ready.then(() => changed.fire());
    });

    return vscode.Disposable.from(provider, watcher, changed);
}
