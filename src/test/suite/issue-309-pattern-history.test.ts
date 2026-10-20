import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Container } from '../../app/index';
import { findAdjacentEntry } from '../../features/navigation/navigation';
import { SyncNoteLinks } from '../../features/notes/sync-note-links';
import { SyncDailyLinks } from '../../features/weekly/sync-daily-links';
import { SCOPE_DEFAULT } from '../../shared/config/configuration';
import { fileExists } from '../../shared/index';
import { FakeWorkspaceConfig } from '../fake-workspace-config';
import { TestLogger } from '../test-logger';

/** The current patterns: yearly folders, the date in the file name; the default patterns are the layout before. */
const PATTERNS = {
    entries: { path: '${base}/${year}', file: '${year}-${month}-${day}.${ext}' },
    notes: { path: '${base}/notes', file: '${d:YYYY-MM-DD}_${input}.${ext}' },
};

/** Entries and notes written before journal.patterns was changed stay reachable (#309). */
suite('Issue #309 — earlier layouts stay reachable', () => {
    let base: string;
    let ctrl: Container;

    const at = (...parts: string[]) => path.join(base, ...parts);
    async function write(file: string, text = '# entry\n'): Promise<string> {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(at(file))));
        await vscode.workspace.fs.writeFile(vscode.Uri.file(at(file)), new TextEncoder().encode(text));
        return at(file);
    }

    setup(async () => {
        base = path.join(os.tmpdir(), `issue309-${Date.now()}`);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(base));
        ctrl = new Container(new FakeWorkspaceConfig({ base, patterns: PATTERNS, 'navigation.mode': 'existing' }), () => new TestLogger(false));
    });

    teardown(async () => {
        try { await vscode.workspace.fs.delete(vscode.Uri.file(base), { recursive: true }); } catch { /* ignore */ }
    });

    test('opening a day of the earlier layout opens that entry, no second one is created', async () => {
        const old = await write('2026/10/01.md');
        assert.strictEqual(await ctrl.reader.loadEntryForDay(new Date(2026, 9, 1)), old);
        assert.ok(!(await fileExists(ctrl.fs, at('2026', '2026-10-01.md'))), 'no entry in the current layout');
    });

    test('a day without an entry is created in the current layout', async () => {
        await write('2026/10/01.md');
        const created = await ctrl.reader.loadEntryForDay(new Date(2026, 9, 2));
        assert.strictEqual(created, at('2026', '2026-10-02.md'));
    });

    test('previous / next navigation crosses from one layout to the other', async () => {
        await write('2026/09/28.md');
        await write('2026/10/01.md');
        await write('2026/2026-10-09.md');
        const step = (date: Date, direction: 'previous' | 'next') =>
            findAdjacentEntry(ctrl, { date, scope: SCOPE_DEFAULT }, direction, 'existing');
        assert.deepStrictEqual(await step(new Date(2026, 9, 9), 'previous'), new Date(2026, 9, 1));
        assert.deepStrictEqual(await step(new Date(2026, 9, 1), 'next'), new Date(2026, 9, 9));
        assert.deepStrictEqual(await step(new Date(2026, 9, 1), 'previous'), new Date(2026, 8, 28));
        assert.strictEqual(await step(new Date(2026, 9, 9), 'next'), null);
    });

    test('the weekly daily links include the entries of the earlier layout', async () => {
        const old = await write('2026/05/11.md');
        const current = await write('2026/2026-05-13.md');
        const found = await new SyncDailyLinks(ctrl).findDailyEntriesForWeek(20, 2026);
        assert.deepStrictEqual(found, [old, current]);
    });

    test('the notes of a day in the earlier notes folder are linked', async () => {
        const old = await write('2026/10/09/Konzept.md', '# Konzept\n');
        const current = await write('notes/2026-10-09_Review.md', '# Review\n');
        const notes = await new SyncNoteLinks(ctrl).getFilesInNotesFolder(new Date(2026, 9, 9), SCOPE_DEFAULT);
        assert.deepStrictEqual(notes.map(uri => uri.fsPath).sort(), [old, current].sort());
    });
});
