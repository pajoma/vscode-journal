import * as assert from 'assert';
import * as vscode from 'vscode';
import { OpenJournalWorkspaceCommand } from '../../provider/commands/open-journal-workspace';
import { ShowNoteCommand } from '../../provider/commands/show-note';
import { createMockCtrl } from './command-test-helpers';

suite('Command suites - note/workspace commands', () => {
    test('OpenJournalWorkspaceCommand forwards base path to vscode.openFolder', async () => {
        const originalExecuteCommand = vscode.commands.executeCommand;
        const calls: unknown[][] = [];

        (vscode.commands as any).executeCommand = async (...args: unknown[]) => {
            calls.push(args);
            return undefined;
        };

        try {
            const ctrl = createMockCtrl({
                config: {
                    getBasePath: () => '/tmp/journal-tests'
                }
            });

            const command = new (OpenJournalWorkspaceCommand as any)(ctrl) as OpenJournalWorkspaceCommand;
            await command.openWorkspace();

            assert.strictEqual(calls.length, 1);
            assert.strictEqual(calls[0][0], 'vscode.openFolder');
            assert.strictEqual((calls[0][1] as vscode.Uri).fsPath, '/tmp/journal-tests');
            assert.strictEqual(calls[0][2], true);
        } finally {
            (vscode.commands as any).executeCommand = originalExecuteCommand;
        }
    });

    test('OpenJournalWorkspaceCommand can open locally from remote warning dialog', async () => {
        const originalExecuteCommand = vscode.commands.executeCommand;
        const originalShowWarningMessage = vscode.window.showWarningMessage;
        const originalOpenExternal = vscode.env.openExternal;
        const calls: unknown[][] = [];
        const externalCalls: vscode.Uri[] = [];

        (vscode.commands as any).executeCommand = async (...args: unknown[]) => {
            calls.push(args);
            return undefined;
        };
        (vscode.window as any).showWarningMessage = async (..._args: unknown[]) => "Open local journal";
        (vscode.env as any).openExternal = async (uri: vscode.Uri) => {
            externalCalls.push(uri);
            return true;
        };

        try {
            const ctrl = createMockCtrl({
                config: {
                    getBasePath: () => 'C:\\Users\\patrick.maue\\Git\\journal',
                    isWindowsStyleBaseConfigured: () => true
                }
            });

            const command = new (OpenJournalWorkspaceCommand as any)(ctrl) as OpenJournalWorkspaceCommand;
            (command as any).shouldPromptLocalOrRemoteInRemoteSession = () => true;
            await command.openWorkspace();

            assert.strictEqual(calls.length, 0, 'vscode.openFolder should not be used for localhost handoff');
            assert.strictEqual(externalCalls.length, 1);
            assert.ok(externalCalls[0].toString().includes('://file/'), 'Expected local file deep-link URI');
        } finally {
            (vscode.commands as any).executeCommand = originalExecuteCommand;
            (vscode.window as any).showWarningMessage = originalShowWarningMessage;
            (vscode.env as any).openExternal = originalOpenExternal;
        }
    });

    test('ShowNoteCommand handles failures by surfacing user error', async () => {
        let errorShown = '';

        const ctrl = createMockCtrl({
            logger: {
                trace: () => undefined,
                debug: () => undefined,
                error: () => undefined,
                printError: () => undefined,
                showChannel: () => undefined
            },
            ui: {
                getUserInput: async () => {
                    throw new Error('mocked input failure');
                },
                showError: (msg: string) => {
                    errorShown = msg;
                }
            }
        });

        const command = new (ShowNoteCommand as any)(ctrl) as ShowNoteCommand;
        await command.execute();

        assert.strictEqual(errorShown, 'Failed to load note.');
    });
});
