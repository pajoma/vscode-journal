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
        let writeCount: number;

        setup(async () => {
            tmpBase = path.join(os.tmpdir(), `issue51-base-${Date.now()}`);
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(tmpBase));

            logger = new TestLogger(false);

            ctrl = new Container(new FakeWorkspaceConfig({ base: tmpBase }), () => logger);

            // the reader returns paths; it writes a file only when it is missing
            writeCount = 0;
            const original = ctrl.fs.writeFile.bind(ctrl.fs);
            (ctrl.fs as any).writeFile = async (p: string, content: Uint8Array) => {
                writeCount++;
                return original(p, content);
            };
        });

        teardown(async () => {
            try {
                await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true });
            } catch { /* ignore */ }
        });

        test('loadEntryForDay writes a missing entry once', async () => {
            const date = new Date();
            const entry = await ctrl.reader.loadEntryForDay(date);
            assert.ok(entry, 'expected the path of the entry');
            assert.strictEqual(writeCount, 1, 'the missing entry is written once');
            assert.deepStrictEqual(logger.errors, [], 'no errors must be logged on the create path');
        });

        test('loadEntryForDay opens an existing entry without overwriting its content', async () => {
            const date = new Date();
            const first = await ctrl.reader.loadEntryForDay(date);
            const entryPath = first;

            const sentinel = `# sentinel ${Date.now()}\n`;
            await vscode.workspace.fs.writeFile(vscode.Uri.file(entryPath), new TextEncoder().encode(sentinel));

            writeCount = 0;
            logger.errors.length = 0;
            await ctrl.reader.loadEntryForDay(date);

            const onDisk = new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.file(entryPath)));
            assert.ok(onDisk.includes('sentinel'), 'existing content must be preserved');
            assert.strictEqual(writeCount, 0, 'an existing entry is not written');
            assert.deepStrictEqual(logger.errors, [], 'no errors must be logged when opening an existing file');
        });

        test('loadEntryForWeek writes a missing weekly entry once', async () => {
            const entry = await ctrl.reader.loadEntryForWeek(20, 2026);
            assert.ok(entry, 'expected the path of the entry');
            assert.strictEqual(writeCount, 1, 'the missing weekly entry is written once');
            assert.deepStrictEqual(logger.errors, [], 'no errors must be logged on the create path');
        });

        test('LoadNotes.loadNote writes a missing note once', async () => {
            const notePath = path.join(tmpBase, `note-${Date.now()}.md`);
            const input = new NoteInput();
            input.text = 'issue51 test note';
            const note = await new LoadNotes(input, ctrl).loadNote(notePath, '# Test\n');
            assert.strictEqual(note, notePath);
            assert.strictEqual(writeCount, 1, 'the missing note is written once');
            assert.deepStrictEqual(logger.errors, [], 'no errors must be logged on the create path');
        });
    });
});
