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

    test('ShowNoteCommand handles failures by surfacing user error', async () => {
        let errorShown = '';

        const ctrl = createMockCtrl({
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
