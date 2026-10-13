import * as assert from 'assert';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { manifestKeys, McpFiles, McpLocations } from '../../features/mcp/mcp-server';
import { launcherCommand, serverEnv } from '../../features/mcp/mcp-files';

const ROOT = path.resolve(__dirname, '../../..');

/** Runs the server as an MCP client does: initialize, then tools/list; returns the tool names and stderr. */
function listTools(command: string, args: string[], env?: Record<string, string>): Promise<{ tools: string[]; stderr: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } });
        let stdout = '';
        let stderr = '';
        child.stderr.on('data', d => { stderr += d; });
        child.stdout.on('data', d => {
            stdout += d;
            for (const line of stdout.split('\n').filter(Boolean)) {
                let message: { id?: number; result?: { tools?: { name: string }[] } };
                try { message = JSON.parse(line); } catch { reject(new Error(`not JSON-RPC on stdout: ${line}`)); child.kill(); return; }
                if (message.id === 2) {
                    child.kill();
                    resolve({ tools: (message.result?.tools ?? []).map(t => t.name), stderr });
                }
            }
        });
        child.on('error', reject);
        // 'close': stderr is complete; a server that exits at once must not fail the writes below
        child.on('close', code => { if (code) { reject(new Error(`exit ${code}: ${stderr}`)); } });
        child.stdin.on('error', () => { /* the server exited */ });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }) + '\n');
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
    });
}

/** The bundled MCP server runs on VS Code's own Node, started through the start script (#292). */
suite('Issue #292 — the bundled MCP server', () => {
    let dir: string;
    let locations: McpLocations;
    let files: McpFiles;

    const mcpEnabled = (value: boolean | undefined) =>
        vscode.workspace.getConfiguration('journal').update('mcp.enabled', value, vscode.ConfigurationTarget.Global);

    setup(async () => {
        await mcpEnabled(true);
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal mcp '));
        locations = {
            bundledServer: path.join(ROOT, 'dist', 'mcp-server.mjs'),
            globalStorage: path.join(dir, 'global storage'),
            workspaceStorage: path.join(dir, 'workspace'),
        };
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
        files = new McpFiles(locations, manifestKeys(pkg), { language: 'en', workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '' });
    });

    teardown(async () => {
        await mcpEnabled(undefined);
        await vscode.workspace.getConfiguration('journal').update('base', undefined, vscode.ConfigurationTarget.Global);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('is part of the build', () => {
        assert.ok(fs.existsSync(locations.bundledServer), 'npm run compile builds dist/mcp-server.mjs');
    });

    test('the start script runs the copied server with VS Code as Node and the user settings', async function () {
        this.timeout(20000);
        await files.refresh();
        assert.ok(fs.readFileSync(files.server).equals(fs.readFileSync(locations.bundledServer)), 'copied out of the versioned extension folder');

        const { command, args } = launcherCommand(process.platform, files.launcher);
        const { tools, stderr } = await listTools(command, args);
        assert.ok(tools.includes('get_daily_journal'), tools.join(', '));
        const settings = JSON.parse(fs.readFileSync(files.userSettings, 'utf8'));
        assert.ok(stderr.includes(`serving ${settings['journal.base']}`), stderr);
    });

    test('Copilot runs the bundled server with VS Code\'s Node and this window\'s settings, resolved like the extension does', async function () {
        this.timeout(20000);
        await files.refresh();
        // the definition the provider returns: process.execPath, the server in the extension, serverEnv(windowSettings)
        const { tools, stderr } = await listTools(process.execPath, [locations.bundledServer], serverEnv(files.windowSettings, files.timezone));
        assert.ok(tools.includes('add_task'), tools.join(', '));

        const settings = JSON.parse(fs.readFileSync(files.windowSettings, 'utf8'));
        const api = vscode.extensions.getExtension('pajoma.vscode-journal')!.exports;
        assert.strictEqual(settings['journal.base'], path.normalize(api.getJournalConfiguration().getBasePath()));
        assert.ok(stderr.includes(`serving ${settings['journal.base']}`), stderr);
        assert.strictEqual(path.dirname(files.windowSettings), locations.workspaceStorage);
    });

    test('off by default: nothing is written, nothing to start', async () => {
        await mcpEnabled(undefined);
        assert.strictEqual(files.enabled, false, 'journal.mcp.enabled defaults to false');
        const state = await files.refresh(true);
        assert.strictEqual(state.windowSettings, '', 'Copilot gets no server');
        assert.deepStrictEqual(fs.existsSync(locations.globalStorage) ? fs.readdirSync(locations.globalStorage) : [], [],
            'no start script, no server copy, no settings before it is turned on');
        assert.ok(!fs.existsSync(files.windowSettings), 'no settings in the workspace storage either');
    });

    test('turning it off stops a server set up before', async function () {
        this.timeout(20000);
        await files.refresh();
        await mcpEnabled(false);
        await files.refresh();
        const { command, args } = launcherCommand(process.platform, files.launcher);
        await assert.rejects(listTools(command, args), /exit 1: journal-mcp is turned off/);
    });

    test('a journal.base with ${workspaceFolder} in the user settings: no start script for external clients', async () => {
        await files.refresh();
        assert.ok(fs.existsSync(files.launcher));
        await vscode.workspace.getConfiguration('journal').update('base', '${workspaceFolder}/journal', vscode.ConfigurationTarget.Global);
        const state = await files.refresh();
        assert.strictEqual(state.unavailableFor, 'journal.base');
        assert.ok(!fs.existsSync(files.launcher), 'a client set up before fails instead of writing to /journal');
        assert.ok(state.windowSettings.length > 0, 'Copilot keeps the window\'s settings');
    });

    test('shared files are replaced in one step, and only a starting window rewrites the server copy', async () => {
        await files.refresh(true);
        assert.deepStrictEqual(fs.readdirSync(locations.globalStorage).filter(f => f.endsWith('.tmp')), [], 'no temporary files left');
        // a window still running the previous version after an update
        fs.writeFileSync(files.server, 'the copy of a newer version');
        await files.refresh();
        assert.strictEqual(fs.readFileSync(files.server, 'utf8'), 'the copy of a newer version', 'a settings change does not write the copy back');
        await files.refresh(true);
        assert.ok(fs.readFileSync(files.server).equals(fs.readFileSync(locations.bundledServer)), 'a starting window writes its version');
    });

    test('only writes files whose content changed', async () => {
        await files.refresh();
        const before = fs.statSync(files.server).mtimeMs;
        fs.utimesSync(files.server, new Date(0), new Date(0));
        await files.refresh(true);
        assert.strictEqual(fs.statSync(files.server).mtimeMs, 0, 'the copy was not rewritten');
        assert.ok(before > 0);
    });

    test('the setup command and the Copilot provider are contributed', async () => {
        assert.ok((await vscode.commands.getCommands(true)).includes('journal.setupMcp'));
        const pkg = vscode.extensions.getExtension('pajoma.vscode-journal')!.packageJSON;
        assert.deepStrictEqual(pkg.contributes.mcpServerDefinitionProviders.map((p: { id: string }) => p.id), ['journal']);
    });
});
