import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as J from '../..';
import { ShowEntryForInputCommand } from '../../provider/commands/show-entry-for-input';
import { ShowEntryForTodayCommand } from '../../provider/commands/show-entry-for-today';
import { ShowEntryForTomorrowCommand } from '../../provider/commands/show-entry-for-tomorrow';
import { ShowEntryForYesterdayCommand } from '../../provider/commands/show-entry-for-yesterday';
import { createMockCtrl, tick } from './command-test-helpers';
import { TestLogger } from '../test-logger';
import { fileExists } from '../../util/fs-exists';

async function buildCtrl(tmpBase: string): Promise<{ ctrl: J.Util.Ctrl; logger: TestLogger }> {
    const config = vscode.workspace.getConfiguration('journal');
    await config.update('base', tmpBase, vscode.ConfigurationTarget.Workspace);
    const refreshed = vscode.workspace.getConfiguration('journal');
    const ctrl = new J.Util.Ctrl(refreshed);
    const logger = new TestLogger(false);
    ctrl.logger = logger;
    return { ctrl, logger };
}

suite('Command suites - entry commands', () => {
    test('exposes command metadata for entry command classes', async () => {
        const commands = [
            new (ShowEntryForInputCommand as any)(createMockCtrl()) as ShowEntryForInputCommand,
            new (ShowEntryForTodayCommand as any)(createMockCtrl()) as ShowEntryForTodayCommand,
            new (ShowEntryForYesterdayCommand as any)(createMockCtrl()) as ShowEntryForYesterdayCommand,
            new (ShowEntryForTomorrowCommand as any)(createMockCtrl()) as ShowEntryForTomorrowCommand
        ];

        const ids = commands.map(command => (command as any).command);
        const uniqueIds = new Set(ids);
        assert.strictEqual(uniqueIds.size, ids.length, 'Expected all command ids to be unique');
        ids.forEach(id => assert.ok(id.startsWith('journal.'), `Expected command id to start with journal.: ${id}`));
    });

    test('ShowEntryForInputCommand loads page and shows document', async () => {
        const input = new J.Model.Input();
        input.offset = 2;
        const fakeDoc = { uri: vscode.Uri.file('/tmp/day.md') } as vscode.TextDocument;

        let loadedInput: J.Model.Input | undefined;
        let shownDoc: vscode.TextDocument | undefined;

        const ctrl = createMockCtrl({
            ui: {
                getUserInputWithValidation: async () => input,
                showDocument: async (doc: vscode.TextDocument) => {
                    shownDoc = doc;
                    return undefined;
                },
                showError: (_msg: string) => undefined
            },
            reader: {
                loadEntryForInput: async (arg: J.Model.Input) => {
                    loadedInput = arg;
                    return fakeDoc;
                }
            },
            inject: {
                injectInput: async (doc: vscode.TextDocument, arg: J.Model.Input) => {
                    assert.strictEqual(doc, fakeDoc);
                    assert.strictEqual(arg, input);
                    return doc;
                }
            }
        });

        const command = new (ShowEntryForInputCommand as any)(ctrl) as ShowEntryForInputCommand;
        await command.execute();
        await tick();

        assert.strictEqual(loadedInput, input);
        assert.strictEqual(shownDoc, fakeDoc);
    });

    test('ShowEntryForInputCommand (memo alias) loads page and shows document', async () => {
        const input = new J.Model.Input();
        input.offset = 0;
        const fakeDoc = { uri: vscode.Uri.file('/tmp/memo.md') } as vscode.TextDocument;

        let shownDoc: vscode.TextDocument | undefined;

        const ctrl = createMockCtrl({
            ui: {
                getUserInputWithValidation: async () => input,
                showDocument: async (doc: vscode.TextDocument) => {
                    shownDoc = doc;
                    return undefined;
                },
                showError: (_msg: string) => undefined
            },
            reader: {
                loadEntryForInput: async (_arg: J.Model.Input) => fakeDoc
            },
            inject: {
                injectInput: async (doc: vscode.TextDocument, _arg: J.Model.Input) => doc
            }
        });

        const command = new (ShowEntryForInputCommand as any)(ctrl) as ShowEntryForInputCommand;
        await command.execute();
        await tick();

        assert.strictEqual(shownDoc, fakeDoc);
    });

    test('ShowEntryForToday/Tomorrow/YesterdayCommand use provided offset inputs', async () => {
        const testCases = [
            { CommandType: ShowEntryForTodayCommand, expected: 0 },
            { CommandType: ShowEntryForTomorrowCommand, expected: 1 },
            { CommandType: ShowEntryForYesterdayCommand, expected: -1 }
        ];

        for (const testCase of testCases) {
            let seenOffset: number | undefined;
            const fakeDoc = { uri: vscode.Uri.file('/tmp/date.md') } as vscode.TextDocument;

            const ctrl = createMockCtrl({
                reader: {
                    loadEntryForInput: async (arg: J.Model.Input) => {
                        seenOffset = arg.offset;
                        return fakeDoc;
                    }
                },
                inject: {
                    injectInput: async (doc: vscode.TextDocument, _arg: J.Model.Input) => doc
                },
                ui: {
                    showDocument: async (_doc: vscode.TextDocument) => undefined,
                    showError: (_msg: string) => undefined
                }
            });

            const cmd = new (testCase.CommandType as any)(ctrl) as ShowEntryForTodayCommand;
            const input2 = new J.Model.Input();
            input2.offset = testCase.expected;
            await cmd.execute(input2);

            assert.strictEqual(seenOffset, testCase.expected);
        }
    });

    test('ShowEntryForTodayCommand offers localhost option for Windows-style base in remote and skips remote load', async () => {
        const originalExecuteCommand = vscode.commands.executeCommand;
        const originalShowWarningMessage = vscode.window.showWarningMessage;
        const originalOpenExternal = vscode.env.openExternal;
        const originalRemoteNameDescriptor = Object.getOwnPropertyDescriptor(vscode.env, 'remoteName');
        const calls: unknown[][] = [];
        const externalCalls: vscode.Uri[] = [];
        let loadCalled = false;

        (vscode.commands as any).executeCommand = async (...args: unknown[]) => {
            calls.push(args);
            return undefined;
        };
        (vscode.window as any).showWarningMessage = async (..._args: unknown[]) => "Open local journal";
        (vscode.env as any).openExternal = async (uri: vscode.Uri) => {
            externalCalls.push(uri);
            return true;
        };
        Object.defineProperty(vscode.env, 'remoteName', { get: () => 'ssh-remote', configurable: true });

        try {
            const ctrl = createMockCtrl({
                config: {
                    getBasePath: () => 'C:\\Users\\patrick.maue\\Git\\journal',
                    getBasePathForLocalOpen: () => 'C:\\Users\\patrick.maue\\Git\\journal',
                    getResolvedEntryPath: async (_date: Date) => ({ value: 'C:\\Users\\patrick.maue\\Git\\journal\\2026\\02' }),
                    getEntryFilePattern: async (_date: Date) => ({ value: '2026-02-17.md' }),
                    isWindowsStyleBaseConfigured: () => true
                },
                reader: {
                    loadEntryForInput: async (_arg: J.Model.Input) => {
                        loadCalled = true;
                        return { uri: vscode.Uri.file('/tmp/never.md') } as vscode.TextDocument;
                    }
                },
                ui: {
                    showDocument: async (_doc: vscode.TextDocument) => undefined,
                    showError: (_msg: string) => undefined
                }
            });

            const cmd = new (ShowEntryForTodayCommand as any)(ctrl) as ShowEntryForTodayCommand;
            const input = new J.Model.Input();
            input.offset = 0;
            await cmd.execute(input);

            assert.strictEqual(loadCalled, false, 'remote loadEntryForInput should be skipped when choosing localhost');
            assert.strictEqual(calls.length, 0, 'vscode.openFolder should not be used for localhost handoff');
            assert.strictEqual(externalCalls.length, 1);
            assert.ok(externalCalls[0].toString().includes('://file/'), 'Expected local file deep-link URI');
        } finally {
            (vscode.commands as any).executeCommand = originalExecuteCommand;
            (vscode.window as any).showWarningMessage = originalShowWarningMessage;
            (vscode.env as any).openExternal = originalOpenExternal;
            if (originalRemoteNameDescriptor) { Object.defineProperty(vscode.env, 'remoteName', originalRemoteNameDescriptor); }
        }
    });
});

suite('Entry commands — real filesystem', function () {
    this.slow(8000);

    let originalBase: string | undefined;
    let tmpBase: string;
    let ctrl: J.Util.Ctrl;
    let logger: TestLogger;

    setup(async () => {
        const config = vscode.workspace.getConfiguration('journal');
        originalBase = config.get<string>('base');
        tmpBase = path.join(os.tmpdir(), `entry-real-${Date.now()}`);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(tmpBase));
        ({ ctrl, logger } = await buildCtrl(tmpBase));
        (ctrl.ui as any).showDocument = async (_doc: vscode.TextDocument) => undefined;
    });

    teardown(async () => {
        const config = vscode.workspace.getConfiguration('journal');
        await config.update('base', originalBase, vscode.ConfigurationTarget.Workspace);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        try { await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true }); } catch { /* ignore */ }
    });

    test('happy: ShowEntryForTodayCommand creates today\'s entry file', async () => {
        const input = new J.Model.Input(0);
        const cmd = new (ShowEntryForTodayCommand as any)(ctrl) as ShowEntryForTodayCommand;
        await cmd.execute(input);

        const today = new Date();
        const year = String(today.getFullYear());
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const expected = vscode.Uri.file(path.join(tmpBase, year, month, `${day}.md`));

        assert.ok(await fileExists(expected), `today's entry should exist at ${expected.fsPath}`);
        assert.strictEqual(logger.errors.length, 0, `unexpected errors: ${JSON.stringify(logger.errors)}`);
    });

    test('happy: ShowEntryForYesterdayCommand creates yesterday\'s entry file', async () => {
        const input = new J.Model.Input(-1);
        const cmd = new (ShowEntryForYesterdayCommand as any)(ctrl) as ShowEntryForYesterdayCommand;
        await cmd.execute(input);

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const year = String(yesterday.getFullYear());
        const month = String(yesterday.getMonth() + 1).padStart(2, '0');
        const day = String(yesterday.getDate()).padStart(2, '0');
        const expected = vscode.Uri.file(path.join(tmpBase, year, month, `${day}.md`));

        assert.ok(await fileExists(expected), `yesterday's entry should exist at ${expected.fsPath}`);
        assert.strictEqual(logger.errors.length, 0, `unexpected errors: ${JSON.stringify(logger.errors)}`);
    });

    test('happy: ShowEntryForTomorrowCommand creates tomorrow\'s entry file', async () => {
        const input = new J.Model.Input(1);
        const cmd = new (ShowEntryForTomorrowCommand as any)(ctrl) as ShowEntryForTomorrowCommand;
        await cmd.execute(input);

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const year = String(tomorrow.getFullYear());
        const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const day = String(tomorrow.getDate()).padStart(2, '0');
        const expected = vscode.Uri.file(path.join(tmpBase, year, month, `${day}.md`));

        assert.ok(await fileExists(expected), `tomorrow's entry should exist at ${expected.fsPath}`);
        assert.strictEqual(logger.errors.length, 0, `unexpected errors: ${JSON.stringify(logger.errors)}`);
    });

    test('error: reader throws — showError is called', async () => {
        let errorCalled = false;
        (ctrl.reader as any).loadEntryForInput = async () => { throw new Error('simulated reader failure'); };
        (ctrl.ui as any).showError = async (_msg: string) => { errorCalled = true; };

        const input = new J.Model.Input(0);
        const cmd = new (ShowEntryForTodayCommand as any)(ctrl) as ShowEntryForTodayCommand;
        await cmd.execute(input);

        assert.ok(errorCalled, 'expected showError to be called when reader throws');
    });
});
