import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as J from '../..';
import { LoadNotes } from '../../provider';
import { fileExists } from '../../util/fs-exists';
import { TestLogger } from '../test-logger';

suite('Issue #51 — Stat-first file creation on remote workspaces', () => {

    suite('fileExists helper', () => {

        test('returns false for a missing path (no error logged)', async () => {
            const missing = vscode.Uri.file(path.join(os.tmpdir(), `issue51-missing-${Date.now()}`));
            const result = await fileExists(missing);
            assert.strictEqual(result, false);
        });

        test('returns true for an existing path', async () => {
            const target = vscode.Uri.file(path.join(os.tmpdir(), `issue51-exists-${Date.now()}.md`));
            await vscode.workspace.fs.writeFile(target, new TextEncoder().encode('content'));
            try {
                const result = await fileExists(target);
                assert.strictEqual(result, true);
            } finally {
                try { await vscode.workspace.fs.delete(target); } catch { /* ignore */ }
            }
        });
    });

    suite('open-before-create antipattern is gone', () => {
        let originalBase: string | undefined;
        let tmpBase: string;
        let ctrl: J.Util.Ctrl;
        let logger: TestLogger;
        let openCallCount: number;

        setup(async () => {
            const config = vscode.workspace.getConfiguration('journal');
            originalBase = config.get<string>('base');

            tmpBase = path.join(os.tmpdir(), `issue51-base-${Date.now()}`);
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(tmpBase));
            await config.update('base', tmpBase, vscode.ConfigurationTarget.Workspace);

            const refreshedConfig = vscode.workspace.getConfiguration('journal');
            ctrl = new J.Util.Ctrl(refreshedConfig);
            logger = new TestLogger(false);
            ctrl.logger = logger;

            openCallCount = 0;
            const original = ctrl.ui.openDocument.bind(ctrl.ui);
            (ctrl.ui as any).openDocument = async (p: string | vscode.Uri) => {
                openCallCount++;
                return original(p);
            };
        });

        teardown(async () => {
            const config = vscode.workspace.getConfiguration('journal');
            await config.update('base', originalBase, vscode.ConfigurationTarget.Workspace);
            try {
                await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true });
            } catch { /* ignore */ }
        });

        test('loadEntryForDay does not call openDocument when the entry is missing', async () => {
            const date = new Date();
            const doc = await ctrl.reader.loadEntryForDay(date);
            assert.ok(doc, 'expected a document');
            assert.strictEqual(openCallCount, 0, 'openDocument must not be called on the create path');
            assert.deepStrictEqual(logger.errors, [], 'no errors must be logged on the create path');
        });

        test('loadEntryForDay opens an existing entry without overwriting its content', async () => {
            const date = new Date();
            const first = await ctrl.reader.loadEntryForDay(date);
            const entryPath = first.uri.fsPath;

            const sentinel = `# sentinel ${Date.now()}\n`;
            await vscode.workspace.fs.writeFile(vscode.Uri.file(entryPath), new TextEncoder().encode(sentinel));

            openCallCount = 0;
            logger.errors.length = 0;
            await ctrl.reader.loadEntryForDay(date);

            const onDisk = new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.file(entryPath)));
            assert.ok(onDisk.includes('sentinel'), 'existing content must be preserved');
            assert.strictEqual(openCallCount, 1, 'openDocument must be called once for an existing file');
            assert.deepStrictEqual(logger.errors, [], 'no errors must be logged when opening an existing file');
        });

        test('loadEntryForWeek does not call openDocument when the weekly entry is missing', async () => {
            const doc = await ctrl.reader.loadEntryForWeek(20);
            assert.ok(doc, 'expected a document');
            assert.strictEqual(openCallCount, 0, 'openDocument must not be called on the create path');
            assert.deepStrictEqual(logger.errors, [], 'no errors must be logged on the create path');
        });

        test('LoadNotes.loadNote does not call openDocument when the note is missing', async () => {
            const notePath = path.join(tmpBase, `note-${Date.now()}.md`);
            const input = new J.Model.NoteInput();
            input.text = 'issue51 test note';
            const doc = await new LoadNotes(input, ctrl).loadNote(notePath, '# Test\n');
            assert.ok(doc, 'expected a document');
            assert.strictEqual(openCallCount, 0, 'openDocument must not be called on the create path');
            assert.deepStrictEqual(logger.errors, [], 'no errors must be logged on the create path');
        });
    });
});
