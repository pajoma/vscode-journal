import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Container } from '../../app/index';
import { JournalPageType } from '../../shared/model/index';
import { TestLogger } from '../test-logger';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

async function seedEntry(base: string, year: number, month: number, day: number, content = '# Entry\n'): Promise<void> {
    const dir = vscode.Uri.file(path.join(base, String(year), String(month).padStart(2, '0')));
    await vscode.workspace.fs.createDirectory(dir);
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, `${String(day).padStart(2, '0')}.md`), new TextEncoder().encode(content));
}

/** The smart input lists from the journal's one scan (#320), cached until something changed (#187). */
suite('Issue #187 — the smart input lists from the cached journal scan', () => {
    let tmpBase: string;
    let ctrl: Container;
    let scans: number;
    let subscription: vscode.Disposable;

    setup(async () => {
        tmpBase = path.join(os.tmpdir(), `issue187-base-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        await seedEntry(tmpBase, 2025, 3, 5);
        await seedEntry(tmpBase, 2025, 3, 8);
        ctrl = new Container(new FakeWorkspaceConfig({ base: tmpBase }), () => new TestLogger(false));
        scans = 0;
        subscription = ctrl.index.onDidScan(() => scans++);
    });

    teardown(async () => {
        subscription.dispose();
        ctrl.index.dispose();
        try { await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true }); } catch { /* ignore */ }
    });

    const list = async () => {
        let entries: string[] = [];
        await ctrl.ui.getScanner().getPreviouslyAccessedFiles(JournalPageType.entry, found => { entries = found.map(e => path.basename(e.path)); });
        return entries;
    };

    test('the first list scans the journal, the next one does not', async () => {
        assert.deepStrictEqual(await list(), ['08.md', '05.md']);
        assert.strictEqual(scans, 1);
        await list();
        assert.strictEqual(scans, 1, 'no second scan');
    });

    test('a new file in the journal folder invalidates the scan', async () => {
        await list();
        await seedEntry(tmpBase, 2025, 4, 1);
        for (let i = 0; i < 40 && !(await list()).includes('01.md'); i++) { await new Promise(r => setTimeout(r, 100)); }
        assert.deepStrictEqual(await list(), ['01.md', '08.md', '05.md'], 'the file watcher reported the new entry');
    });

    test('clearCache scans again', async () => {
        await list();
        ctrl.ui.getScanner().clearCache();
        await list();
        assert.strictEqual(scans, 2);
    });
});
