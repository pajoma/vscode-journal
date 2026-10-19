import * as assert from 'assert';
import * as vscode from 'vscode';

/**
 * Runs first (file name): the very first command after VS Code started works.
 * activate() used to return before the commands were registered, so a command
 * pressed while the extension was starting failed with "command not found".
 */
suite('The first command after startup', () => {
    test('is registered when activation is done', async () => {
        await vscode.commands.executeCommand('journal.today');
        assert.ok(vscode.window.activeTextEditor, 'today\'s entry is open');
    });
});
