import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Input } from '../../shared/model/index';
import { Container } from '../../app/index';
import { TestLogger } from '../test-logger';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

function buildCtrl(tmpBase: string): { ctrl: Container; logger: TestLogger } {
    const logger = new TestLogger(false);
    const ctrl = new Container(new FakeWorkspaceConfig({ base: tmpBase }), () => logger);
    return { ctrl, logger };
}

suite('Inject — memo and task insertion', function () {
    this.slow(5000);

    let tmpBase: string;
    let ctrl: Container;
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

        const input = new Input(0);
        input.kind = 'memo';
        input.text = 'lorem ipsum memo';

        await ctrl.inject.injectInput(doc, input);

        // applyEdit modifies the in-memory document; getText() reflects the change without a disk save
        const content = await ctrl.editor.getText(doc);
        assert.ok(content.includes('lorem ipsum memo'), `memo not found in entry. Content: ${content}`);
        assert.strictEqual(logger.errors.length, 0, `unexpected errors: ${JSON.stringify(logger.errors)}`);
    });

    test('happy: task text is injected into today\'s entry', async () => {
        const doc = await ctrl.reader.loadEntryForDay(new Date());
        assert.ok(doc, 'expected today\'s entry document');

        const input = new Input(0);
        input.kind = 'task';
        input.text = 'implement something';

        await ctrl.inject.injectInput(doc, input);

        const content = await ctrl.editor.getText(doc);
        assert.ok(content.includes('implement something'), `task text not found in entry. Content: ${content}`);
        assert.ok(content.includes('[]') || content.includes('[ ]'), `task bullet not found in entry. Content: ${content}`);
        assert.strictEqual(logger.errors.length, 0, `unexpected errors: ${JSON.stringify(logger.errors)}`);
    });

    test('error: empty memo text — injectInput returns early, no error logged, doc unchanged', async () => {
        const doc = await ctrl.reader.loadEntryForDay(new Date());
        const contentBefore = await ctrl.editor.getText(doc);

        const input = new Input(0);
        // a memo without text adds nothing — injectInput returns early
        input.kind = 'memo';
        input.text = '';

        const result = await ctrl.inject.injectInput(doc, input);

        assert.ok(result, 'injectInput should return the document');
        assert.strictEqual(logger.errors.length, 0, `unexpected errors: ${JSON.stringify(logger.errors)}`);
        assert.strictEqual(await ctrl.editor.getText(result), contentBefore, 'document should be unchanged for empty memo');
    });

    test('a document with the same fsPath but another scheme (diff editor) is not the entry', async () => {
        const entry = await ctrl.reader.loadEntryForDay(new Date());
        // stands in for the git: side of a diff editor, opened before the entry itself
        const provider = vscode.workspace.registerTextDocumentContentProvider('journal-test-git', {
            provideTextDocumentContent: () => '# HEAD version\n',
        });
        try {
            const head = await vscode.workspace.openTextDocument(vscode.Uri.from({ scheme: 'journal-test-git', path: vscode.Uri.file(entry).path }));
            assert.strictEqual(head.uri.fsPath, entry, 'precondition: same fsPath');

            const input = new Input(0);
            input.kind = 'memo';
            input.text = 'memo beside a diff';
            await ctrl.inject.injectInput(entry, input);
            await ctrl.editor.save(entry);

            const onDisk = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(entry))).toString();
            assert.ok(onDisk.includes('memo beside a diff'), `memo not saved to the file. Content: ${onDisk}`);
            assert.ok(!onDisk.includes('HEAD version'), 'the text of the other document must not be used');
            assert.strictEqual(head.getText(), '# HEAD version\n', 'the other document is untouched');
        } finally {
            provider.dispose();
        }
    });
});
