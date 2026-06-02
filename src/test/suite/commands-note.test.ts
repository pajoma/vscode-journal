import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Container } from '../../app';
import { ShowNoteCommand } from '../../commands/show-note';
import { TestLogger } from '../test-logger';
import { fileExists } from '../../util/fs-exists';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

function buildCtrl(tmpBase: string): { ctrl: Container; logger: TestLogger } {
    const logger = new TestLogger(false);
    const ctrl = new Container(new FakeWorkspaceConfig({ base: tmpBase }), () => logger);
    return { ctrl, logger };
}

suite('ShowNoteCommand — note creation', function () {
    this.slow(5000);

    let tmpBase: string;
    let ctrl: Container;
    let logger: TestLogger;

    setup(async () => {
        tmpBase = path.join(os.tmpdir(), `note-base-${Date.now()}`);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(tmpBase));
        ({ ctrl, logger } = buildCtrl(tmpBase));
    });

    teardown(async () => {
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
        assert.ok(await fileExists(ctrl.fs, shownDoc!.uri.fsPath), `note file should exist at ${shownDoc!.uri.fsPath}`);
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
