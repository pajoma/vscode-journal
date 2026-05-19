import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as J from '../..';
import { TestLogger } from '../test-logger';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

function buildCtrl(tmpBase: string): { ctrl: J.Util.Ctrl; logger: TestLogger } {
    const ctrl = new J.Util.Ctrl(new FakeWorkspaceConfig({ base: tmpBase }));
    const logger = new TestLogger(false);
    ctrl.initServices(logger);
    return { ctrl, logger };
}

suite('Inject — memo and task insertion', function () {
    this.slow(5000);

    let tmpBase: string;
    let ctrl: J.Util.Ctrl;
    let logger: TestLogger;

    setup(async () => {
        tmpBase = path.join(os.tmpdir(), `inject-base-${Date.now()}`);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(tmpBase));
        ({ ctrl, logger } = buildCtrl(tmpBase));
    });

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        try { await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true }); } catch { /* ignore */ }
    });

    test('happy: memo text is injected into today\'s entry', async () => {
        const doc = await ctrl.reader.loadEntryForDay(new Date());
        assert.ok(doc, 'expected today\'s entry document');

        const input = new J.Model.Input(0);
        input.flags = 'memo';
        input.text = 'lorem ipsum memo';

        await ctrl.inject.injectInput(doc, input);

        // applyEdit modifies the in-memory document; getText() reflects the change without a disk save
        const content = doc.getText();
        assert.ok(content.includes('lorem ipsum memo'), `memo not found in entry. Content: ${content}`);
        assert.strictEqual(logger.errors.length, 0, `unexpected errors: ${JSON.stringify(logger.errors)}`);
    });

    test('happy: task text is injected into today\'s entry', async () => {
        const doc = await ctrl.reader.loadEntryForDay(new Date());
        assert.ok(doc, 'expected today\'s entry document');

        const input = new J.Model.Input(0);
        input.flags = 'task';
        input.text = 'implement something';

        await ctrl.inject.injectInput(doc, input);

        const content = doc.getText();
        assert.ok(content.includes('implement something'), `task text not found in entry. Content: ${content}`);
        assert.ok(content.includes('[]') || content.includes('[ ]'), `task bullet not found in entry. Content: ${content}`);
        assert.strictEqual(logger.errors.length, 0, `unexpected errors: ${JSON.stringify(logger.errors)}`);
    });

    test('error: empty memo text — injectInput returns early, no error logged, doc unchanged', async () => {
        const doc = await ctrl.reader.loadEntryForDay(new Date());
        const contentBefore = doc.getText();

        const input = new J.Model.Input(0);
        // hasMemo() requires text.length > 0 — empty text causes early return
        input.flags = 'memo';
        input.text = '';

        const result = await ctrl.inject.injectInput(doc, input);

        assert.ok(result, 'injectInput should return the document');
        assert.strictEqual(logger.errors.length, 0, `unexpected errors: ${JSON.stringify(logger.errors)}`);
        assert.strictEqual(result.getText(), contentBefore, 'document should be unchanged for empty memo');
    });
});
