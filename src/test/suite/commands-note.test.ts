import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as J from '../..';
import { ShowNoteCommand } from '../../commands/show-note';
import { TestLogger } from '../test-logger';
import { fileExists } from '../../util/fs-exists';

async function buildCtrl(tmpBase: string): Promise<{ ctrl: J.Util.Ctrl; logger: TestLogger }> {
    const config = vscode.workspace.getConfiguration('journal');
    await config.update('base', tmpBase, vscode.ConfigurationTarget.Workspace);
    const refreshed = vscode.workspace.getConfiguration('journal');
    const ctrl = new J.Util.Ctrl(refreshed);
    const logger = new TestLogger(false);
    ctrl.initServices(logger);
    return { ctrl, logger };
}

suite('ShowNoteCommand — note creation', function () {
    this.slow(5000);

    let originalBase: string | undefined;
    let tmpBase: string;
    let ctrl: J.Util.Ctrl;
    let logger: TestLogger;

    setup(async () => {
        const config = vscode.workspace.getConfiguration('journal');
        originalBase = config.get<string>('base');
        tmpBase = path.join(os.tmpdir(), `note-base-${Date.now()}`);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(tmpBase));
        ({ ctrl, logger } = await buildCtrl(tmpBase));
    });

    teardown(async () => {
        const config = vscode.workspace.getConfiguration('journal');
        await config.update('base', originalBase, vscode.ConfigurationTarget.Workspace);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        try { await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true }); } catch { /* ignore */ }
    });

    test('happy: note file is created and shown when user provides a title', async () => {
        let shownDoc: vscode.TextDocument | undefined;
        (ctrl.ui as any).getUserInput = async (_tip: string) => 'my test note';
        (ctrl.ui as any).showDocument = async (doc: vscode.TextDocument) => {
            shownDoc = doc;
            return undefined;
        };

        const cmd = new (ShowNoteCommand as any)(ctrl) as ShowNoteCommand;
        await cmd.execute();

        assert.ok(shownDoc, 'expected showDocument to be called');
        assert.ok(await fileExists(shownDoc!.uri), `note file should exist at ${shownDoc!.uri.fsPath}`);
        assert.strictEqual(logger.errors.length, 0, `unexpected errors: ${JSON.stringify(logger.errors)}`);
    });

    test('error: showError called when getUserInput throws (user cancels)', async () => {
        let errorCalled = false;
        (ctrl.ui as any).getUserInput = async (_tip: string) => { throw new Error('user cancelled'); };
        (ctrl.ui as any).showError = async (_msg: string) => { errorCalled = true; };

        const cmd = new (ShowNoteCommand as any)(ctrl) as ShowNoteCommand;
        await cmd.execute();

        assert.ok(errorCalled, 'expected showError to be called on cancellation');
    });
});
