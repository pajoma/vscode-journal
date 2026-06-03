import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { NoteInput } from '../../shared/model/index';
import { Container } from '../../app/index';
import { LoadNotes } from '../../features/notes/load-note';
import { fileExists } from '../../shared/fs/fs-exists';
import { VscodeFileSystem } from '../../shared/fs/vscode-fs';
import { TestLogger } from '../test-logger';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

suite('Issue #51 — Stat-first file creation on remote workspaces', () => {

    suite('fileExists helper', () => {
        const vsFs = new VscodeFileSystem();

        test('returns false for a missing path (no error logged)', async () => {
            const missing = vscode.Uri.file(path.join(os.tmpdir(), `issue51-missing-${Date.now()}`));
            const result = await fileExists(vsFs, missing.fsPath);
            assert.strictEqual(result, false);
        });

        test('returns true for an existing path', async () => {
            const target = vscode.Uri.file(path.join(os.tmpdir(), `issue51-exists-${Date.now()}.md`));
            await vscode.workspace.fs.writeFile(target, new TextEncoder().encode('content'));
            try {
                const result = await fileExists(vsFs, target.fsPath);
                assert.strictEqual(result, true);
            } finally {
                try { await vscode.workspace.fs.delete(target); } catch { /* ignore */ }
            }
        });
    });

    suite('open-before-create antipattern is gone', () => {
        let tmpBase: string;
        let ctrl: Container;
        let logger: TestLogger;
        let openCallCount: number;
        let createCount: number;

        setup(async () => {
            tmpBase = path.join(os.tmpdir(), `issue51-base-${Date.now()}`);
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(tmpBase));

            logger = new TestLogger(false);

            ctrl = new Container(new FakeWorkspaceConfig({ base: tmpBase }), () => logger);

            openCallCount = 0;
            createCount = 0;
            // Reader/LoadNotes open existing files via the editor adapter; missing
            // files go through createAndOpen (write-then-open), never open-on-missing (#239).
            const originalOpen = ctrl.editor.open.bind(ctrl.editor);
            (ctrl.editor as any).open = async (p: string | vscode.Uri) => {
                openCallCount++;
                return originalOpen(p);
            };
            const originalCreate = ctrl.editor.createAndOpen.bind(ctrl.editor);
            (ctrl.editor as any).createAndOpen = async (p: string, c: string) => {
                createCount++;
                return originalCreate(p, c);
            };
        });

        teardown(async () => {
            try {
                await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true });
            } catch { /* ignore */ }
        });

        test('loadEntryForDay does not call openDocument when the entry is missing', async () => {
            const date = new Date();
            const doc = await ctrl.reader.loadEntryForDay(date);
            assert.ok(doc, 'expected a document');
            assert.strictEqual(createCount, 1, 'create path must use createAndOpen (write-then-open)');
            assert.deepStrictEqual(logger.errors, [], 'no errors must be logged on the create path');
        });

        test('loadEntryForDay opens an existing entry without overwriting its content', async () => {
            const date = new Date();
            const first = await ctrl.reader.loadEntryForDay(date);
            const entryPath = first.uri.fsPath;

            const sentinel = `# sentinel ${Date.now()}\n`;
            await vscode.workspace.fs.writeFile(vscode.Uri.file(entryPath), new TextEncoder().encode(sentinel));

            openCallCount = 0;
            createCount = 0;
            logger.errors.length = 0;
            await ctrl.reader.loadEntryForDay(date);

            const onDisk = new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.file(entryPath)));
            assert.ok(onDisk.includes('sentinel'), 'existing content must be preserved');
            assert.strictEqual(openCallCount, 1, 'open must be called once for an existing file');
            assert.strictEqual(createCount, 0, 'createAndOpen must not be called for an existing file');
            assert.deepStrictEqual(logger.errors, [], 'no errors must be logged when opening an existing file');
        });

        test('loadEntryForWeek does not call openDocument when the weekly entry is missing', async () => {
            const doc = await ctrl.reader.loadEntryForWeek(20);
            assert.ok(doc, 'expected a document');
            assert.strictEqual(createCount, 1, 'create path must use createAndOpen (write-then-open)');
            assert.deepStrictEqual(logger.errors, [], 'no errors must be logged on the create path');
        });

        test('LoadNotes.loadNote does not call openDocument when the note is missing', async () => {
            const notePath = path.join(tmpBase, `note-${Date.now()}.md`);
            const input = new NoteInput();
            input.text = 'issue51 test note';
            const doc = await new LoadNotes(input, ctrl).loadNote(notePath, '# Test\n');
            assert.ok(doc, 'expected a document');
            assert.strictEqual(createCount, 1, 'create path must use createAndOpen (write-then-open)');
            assert.deepStrictEqual(logger.errors, [], 'no errors must be logged on the create path');
        });
    });
});
