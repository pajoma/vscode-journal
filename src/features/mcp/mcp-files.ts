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

/*
 * The files that let MCP clients start the bundled journal MCP server (#292),
 * as plain text: no vscode, unit-tested in node.
 */

import * as Path from 'path';
import { IWorkspaceConfigReader, JournalConfiguration, NO_HOST, HostEnvironment } from 'journal-core';

/** Name the server is registered under, in every client. */
export const SERVER_NAME = 'journal';

/** The environment that turns VS Code's executable into Node and points the server at its settings. */
export function serverEnv(settingsFile: string, timezone: string): Record<string, string> {
    return { ELECTRON_RUN_AS_NODE: '1', JOURNAL_SETTINGS: settingsFile, JOURNAL_TIMEZONE: timezone };
}

/**
 * The executable that external clients start. In the extension host on macOS
 * `process.execPath` is a helper app (`…/Contents/Frameworks/Code Helper (Plugin).app/…`);
 * the `code` CLI runs the app's main executable as Node, so do the same. A Snap
 * install lives in a folder per revision; `current` keeps the path across updates.
 */
export function mainExecutable(execPath: string, platform: NodeJS.Platform, listDir: (dir: string) => string[]): string {
    if (platform === 'darwin') {
        const at = execPath.indexOf('/Contents/Frameworks/');
        if (at >= 0) {
            const macOS = execPath.slice(0, at) + '/Contents/MacOS';
            try {
                const entries = listDir(macOS);
                if (entries.length === 1) { return `${macOS}/${entries[0]}`; }
            } catch {
                // fall back to the helper, which runs as Node, too
            }
        }
        return execPath;
    }
    if (platform === 'linux') {
        return execPath.replace(/^\/snap\/([^/]+)\/\d+\//, '/snap/$1/current/');
    }
    return execPath;
}

/** File name of the start script. */
export function launcherName(platform: NodeJS.Platform): string {
    return platform === 'win32' ? 'journal-mcp.cmd' : 'journal-mcp';
}

const HEADER = 'Written by vscode-journal whenever it starts (#292); changes are overwritten.';

/**
 * The start script external clients run: the current VS Code executable runs
 * the server as Node. stdout carries the protocol, so the script prints nothing.
 */
export function launcherScript(platform: NodeJS.Platform, executable: string, server: string, env: Record<string, string>): string {
    if (platform === 'win32') {
        // `set "K=V"` keeps special characters except %, which must be doubled in a batch file
        const cmd = (value: string) => value.replace(/%/g, '%%');
        return [
            '@echo off',
            `rem ${HEADER}`,
            ...Object.entries(env).map(([key, value]) => `set "${key}=${cmd(value)}"`),
            `"${cmd(executable)}" "${cmd(server)}" %*`,
            '',
        ].join('\r\n');
    }
    return [
        '#!/bin/sh',
        `# ${HEADER}`,
        ...Object.entries(env).map(([key, value]) => `export ${key}=${shellQuote(value)}`),
        `exec ${shellQuote(executable)} ${shellQuote(server)} "$@"`,
        '',
    ].join('\n');
}

/** A word for sh, in single quotes. */
export function shellQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Command and arguments a client stores. Node-based clients (Claude Code) can't
 * start a `.cmd` file without a shell since Node 20.12, so Windows goes through `cmd /c`.
 */
export function launcherCommand(platform: NodeJS.Platform, launcher: string): { command: string; args: string[] } {
    return platform === 'win32' ? { command: 'cmd', args: ['/c', launcher] } : { command: launcher, args: [] };
}

export type McpClient = 'claude' | 'codex' | 'other';

/** The line to run in a terminal, quoted for the platform's usual shells. */
export function setupCommand(client: 'claude' | 'codex', platform: NodeJS.Platform, launcher: string): string {
    const { command, args } = launcherCommand(platform, launcher);
    const quote = platform === 'win32' ? (v: string) => (/[\s"]/.test(v) ? `"${v}"` : v) : (v: string) => (/^[\w./:-]+$/.test(v) ? v : shellQuote(v));
    const run = [command, ...args].map(quote).join(' ');
    return client === 'claude'
        ? `claude mcp add --scope user ${SERVER_NAME} -- ${run}`
        : `codex mcp add ${SERVER_NAME} -- ${run}`;
}

/** The `[mcp_servers.journal]` block for Codex's `config.toml`. */
export function codexToml(platform: NodeJS.Platform, launcher: string): string {
    const { command, args } = launcherCommand(platform, launcher);
    const str = (v: string) => JSON.stringify(v); // a JSON string is a valid TOML basic string
    const lines = [`[mcp_servers.${SERVER_NAME}]`, `command = ${str(command)}`];
    if (args.length > 0) { lines.push(`args = [${args.map(str).join(', ')}]`); }
    return lines.join('\n') + '\n';
}

/** The `mcpServers` block most other clients (Claude Desktop, Cursor, Gemini CLI, …) read. */
export function mcpServersJson(platform: NodeJS.Platform, launcher: string): string {
    const { command, args } = launcherCommand(platform, launcher);
    return JSON.stringify({ mcpServers: { [SERVER_NAME]: { command, args } } }, null, 2) + '\n';
}

const WORKSPACE_VARIABLE = /\$\{(workspaceFolder|workspaceRoot)\}/;

/**
 * The first journal folder setting that needs a workspace (`${workspaceFolder}`,
 * `${workspaceRoot}`): `journal.base`, `journal.scopeRoot` or a base in
 * `journal.scopes`. External clients run outside of any workspace, so these
 * can't be resolved for them; resolved against nothing, `${workspaceFolder}/journal`
 * would become `/journal`.
 * @returns the setting, e.g. `journal.base`, or undefined if all folders resolve without a workspace
 */
export function workspaceDependentSetting(value: (key: string) => unknown): string | undefined {
    const uses = (v: unknown) => typeof v === 'string' && WORKSPACE_VARIABLE.test(v);
    if (uses(value('base'))) { return 'journal.base'; }
    if (uses(value('scopeRoot'))) { return 'journal.scopeRoot'; }
    const scopes = value('scopes');
    if (Array.isArray(scopes) && scopes.some(scope => uses((scope as { base?: unknown })?.base))) { return 'journal.scopes'; }
    return undefined;
}

/**
 * The settings file the server reads (`JOURNAL_SETTINGS`): every `journal.*`
 * setting of the manifest with its value, the base and the locale resolved
 * like in the extension, so the server needs no workspace and no UI language.
 */
export function settingsFile(keys: string[], value: (key: string) => unknown, host: HostEnvironment = NO_HOST): string {
    const values: Record<string, unknown> = {};
    for (const key of keys) {
        const v = value(key);
        if (v !== undefined) { values[key] = v; }
    }
    const reader: IWorkspaceConfigReader = {
        get: <T>(key: string, defaultValue?: T) => (values[key] ?? defaultValue) as T,
    };
    const config = new JournalConfiguration(reader, host);
    const settings: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(values)) { settings[`journal.${key}`] = v; }
    settings['journal.base'] = Path.normalize(config.getBasePath());
    settings['journal.locale'] = config.getLocale();
    return JSON.stringify(settings, null, 2) + '\n';
}
