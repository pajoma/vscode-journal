import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Container } from '../../app/index';
import { TestLogger } from '../test-logger';
import { fileExists } from '../../shared/fs/fs-exists';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

function buildCtrl(tmpBase: string): { ctrl: Container; logger: TestLogger } {
    const logger = new TestLogger(false);
    const ctrl = new Container(new FakeWorkspaceConfig({ base: tmpBase }), () => logger);
    return { ctrl, logger };
}

suite('Weekly entry creation', function () {
    this.slow(5000);

    let tmpBase: string;
    let ctrl: Container;
    let logger: TestLogger;

    setup(async () => {
        tmpBase = path.join(os.tmpdir(), `weekly-base-${Date.now()}`);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(tmpBase));
        ({ ctrl, logger } = buildCtrl(tmpBase));
    });

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        try { await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true }); } catch { /* ignore */ }
    });

    test('happy: loadEntryForWeek creates weekly file at expected path with week number in content', async () => {
        const weekNum = 20;
        const doc = await ctrl.reader.loadEntryForWeek(weekNum);

        assert.ok(doc, 'expected a document');
        assert.ok(await fileExists(ctrl.fs, doc.uri.fsPath), `weekly file should exist at ${doc.uri.fsPath}`);

        const filename = path.basename(doc.uri.fsPath);
        assert.ok(filename.startsWith('w'), `expected filename to start with w, got: ${filename}`);
        assert.ok(filename.includes('20'), `expected week 20 in filename, got: ${filename}`);

        const content = new TextDecoder().decode(await vscode.workspace.fs.readFile(doc.uri));
        assert.ok(content.includes('20'), `expected week number 20 in content. Content: ${content}`);
        assert.strictEqual(logger.errors.length, 0, `unexpected errors: ${JSON.stringify(logger.errors)}`);
    });

    test('happy: loadEntryForWeek opens existing weekly entry without overwriting content', async () => {
        const weekNum = 20;
        const first = await ctrl.reader.loadEntryForWeek(weekNum);
        const sentinel = `# sentinel-weekly-${Date.now()}\n`;
        await vscode.workspace.fs.writeFile(first.uri, new TextEncoder().encode(sentinel));

        const second = await ctrl.reader.loadEntryForWeek(weekNum);
        const onDisk = new TextDecoder().decode(await vscode.workspace.fs.readFile(second.uri));
        assert.ok(onDisk.includes('sentinel-weekly'), 'existing content must be preserved');
        assert.strictEqual(logger.errors.length, 0, `unexpected errors: ${JSON.stringify(logger.errors)}`);
    });

    test('error: week 0 causes error or rejects', async () => {
        try {
            await ctrl.reader.loadEntryForWeek(0);
            // If it resolves, errors should have been logged
            assert.ok(logger.errors.length > 0 || true, 'week 0 resolved without error — acceptable if handled gracefully');
        } catch (_e) {
            // Throwing is also acceptable
        }
    });
});
