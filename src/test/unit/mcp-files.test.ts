import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { codexToml, launcherCommand, launcherScript, mainExecutable, mcpServersJson, settingsFile, setupCommand } from '../../features/mcp/mcp-files';

/** The files that let MCP clients start the bundled server (#292). */
suite('Issue #292 — MCP server files', () => {

    suite('the executable external clients start', () => {
        const helper = '/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)';

        test('macOS: the main executable of the app, like the code CLI', () => {
            const listed: string[] = [];
            const exe = mainExecutable(helper, 'darwin', dir => { listed.push(dir); return ['Code']; });
            assert.strictEqual(exe, '/Applications/Visual Studio Code.app/Contents/MacOS/Code');
            assert.deepStrictEqual(listed, ['/Applications/Visual Studio Code.app/Contents/MacOS']);
        });

        test('macOS: the helper when the main executable is not found', () => {
            assert.strictEqual(mainExecutable(helper, 'darwin', () => { throw new Error('ENOENT'); }), helper);
            assert.strictEqual(mainExecutable(helper, 'darwin', () => ['Code', 'Other']), helper);
        });

        test('Snap: the current revision instead of the installed one', () => {
            assert.strictEqual(mainExecutable('/snap/code/187/usr/share/code/code', 'linux', () => []), '/snap/code/current/usr/share/code/code');
            assert.strictEqual(mainExecutable('/usr/share/code/code', 'linux', () => []), '/usr/share/code/code');
            assert.strictEqual(mainExecutable('C:\\Program Files\\Microsoft VS Code\\Code.exe', 'win32', () => []), 'C:\\Program Files\\Microsoft VS Code\\Code.exe');
        });
    });

    suite('the start script', () => {
        const env = { ELECTRON_RUN_AS_NODE: '1', JOURNAL_SETTINGS: "/Users/o'neil/My Settings/settings.json", JOURNAL_TIMEZONE: 'Europe/Berlin' };

        test('sh: sets the environment and passes stdin, stdout and arguments through', function () {
            if (process.platform === 'win32') { this.skip(); }
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), "journal mcp '292' "));
            const server = path.join(dir, 'server $HOME.js');
            fs.writeFileSync(server, "process.stdin.on('data', d => process.stdout.write(JSON.stringify({ in: String(d), env: process.env.JOURNAL_SETTINGS, node: process.env.ELECTRON_RUN_AS_NODE, args: process.argv.slice(2) })));");
            const launcher = path.join(dir, 'journal-mcp');
            fs.writeFileSync(launcher, launcherScript('linux', process.execPath, server, env), { mode: 0o755 });

            const out = JSON.parse(execFileSync(launcher, ['--x', 'a b'], { input: 'ping' }).toString());
            assert.deepStrictEqual(out, { in: 'ping', env: env.JOURNAL_SETTINGS, node: '1', args: ['--x', 'a b'] }, 'nothing but the server writes to stdout');
            fs.rmSync(dir, { recursive: true, force: true });
        });

        test('cmd: prints nothing, quotes paths and doubles %', () => {
            const script = launcherScript('win32', 'C:\\VS Code\\Code.exe', 'C:\\Users\\A B\\100%\\mcp-server.mjs', env);
            const lines = script.split('\r\n');
            assert.strictEqual(lines[0], '@echo off');
            assert.ok(lines.includes('set "ELECTRON_RUN_AS_NODE=1"'), script);
            assert.ok(lines.includes(`set "JOURNAL_SETTINGS=${env.JOURNAL_SETTINGS}"`), script);
            assert.ok(lines.includes('"C:\\VS Code\\Code.exe" "C:\\Users\\A B\\100%%\\mcp-server.mjs" %*'), script);
            assert.ok(!/[^\r]\n/.test(script), 'CRLF line ends');
        });
    });

    suite('what clients store', () => {
        test('Windows goes through cmd /c: Node-based clients cannot start a .cmd file directly', () => {
            assert.deepStrictEqual(launcherCommand('win32', 'C:\\x\\journal-mcp.cmd'), { command: 'cmd', args: ['/c', 'C:\\x\\journal-mcp.cmd'] });
            assert.deepStrictEqual(launcherCommand('darwin', '/x/journal-mcp'), { command: '/x/journal-mcp', args: [] });
        });

        test('Claude Code and Codex commands, quoted for the shell', () => {
            const mac = '/Users/me/Library/Application Support/Code/User/globalStorage/pajoma.vscode-journal/journal-mcp';
            assert.strictEqual(setupCommand('claude', 'darwin', mac), `claude mcp add --scope user journal -- '${mac}'`);
            assert.strictEqual(setupCommand('codex', 'linux', '/home/me/.config/Code/journal-mcp'), 'codex mcp add journal -- /home/me/.config/Code/journal-mcp');
            assert.strictEqual(setupCommand('claude', 'win32', 'C:\\Users\\A B\\journal-mcp.cmd'), 'claude mcp add --scope user journal -- cmd /c "C:\\Users\\A B\\journal-mcp.cmd"');
        });

        test('config.toml block for Codex and mcpServers JSON for other clients', () => {
            assert.strictEqual(codexToml('win32', 'C:\\x\\journal-mcp.cmd'), '[mcp_servers.journal]\ncommand = "cmd"\nargs = ["/c", "C:\\\\x\\\\journal-mcp.cmd"]\n');
            assert.strictEqual(codexToml('darwin', '/x/journal-mcp'), '[mcp_servers.journal]\ncommand = "/x/journal-mcp"\n');
            assert.deepStrictEqual(JSON.parse(mcpServersJson('darwin', '/x/journal-mcp')), { mcpServers: { journal: { command: '/x/journal-mcp', args: [] } } });
        });
    });

    suite('the settings file the server reads', () => {
        test('all given settings with the base and the locale resolved like in the extension', () => {
            const values: Record<string, unknown> = { base: '${workspaceFolder}/journal', ext: 'md', locale: '', dev: undefined };
            const json = JSON.parse(settingsFile(Object.keys(values), key => values[key], { language: 'de', workspaceRoot: () => '/ws' }));
            assert.deepStrictEqual(json, { 'journal.base': path.normalize('/ws/journal'), 'journal.ext': 'md', 'journal.locale': 'de' });
        });

        test('an empty base is the default journal folder', () => {
            const json = JSON.parse(settingsFile(['base'], () => ''));
            assert.strictEqual(json['journal.base'], path.join(os.homedir(), 'Journal'));
        });
    });
});
