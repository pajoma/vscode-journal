import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Container } from '../../app/index';
import { MigrateLayoutCommand } from '../../features/layouts/commands/migrate-layout';
import { LayoutWatcher } from '../../features/layouts/layout-watcher';
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

    test('a changed layout opens a modal warning that points to the migration', async () => {
        const settings: Record<string, unknown> = { base, patterns: PATTERNS };
        const watched = new Container(new FakeWorkspaceConfig(settings), () => new TestLogger(false));
        const window = vscode.window as any;
        const commands = vscode.commands as any;
        const original = { showWarningMessage: window.showWarningMessage, executeCommand: commands.executeCommand };
        const warnings: { message: string; options: vscode.MessageOptions }[] = [];
        const executed: string[] = [];
        window.showWarningMessage = async (message: string, options: vscode.MessageOptions, ...actions: string[]) => {
            warnings.push({ message, options });
            return actions[0];
        };
        commands.executeCommand = async (command: string) => { executed.push(command); };
        const watcher = new LayoutWatcher(watched);
        try {
            await watcher.check();
            assert.strictEqual(warnings.length, 0, 'no warning while the layout is the same');

            settings.patterns = { entries: { path: '${base}/daily/${year}', file: '${month}-${day}.${ext}' } };
            await watcher.check();
            assert.strictEqual(warnings.length, 1);
            assert.strictEqual(warnings[0].message, 'The journal layout has changed.');
            assert.ok(warnings[0].options.modal, 'modal');
            assert.ok(warnings[0].options.detail!.includes('Journal: Migrate to Current Layout'));
            assert.ok(warnings[0].options.detail!.includes('journal.patternHistory'));
            assert.deepStrictEqual(executed, ['journal.migrateLayout'], 'the button runs the migration');

            await watcher.check();
            assert.strictEqual(warnings.length, 1, 'warned once per change');
        } finally {
            watcher.dispose();
            Object.assign(window, { showWarningMessage: original.showWarningMessage });
            Object.assign(commands, { executeCommand: original.executeCommand });
        }
    });

    suite('Journal: Migrate to Current Layout', () => {
        const window = vscode.window as any;
        const original = { showQuickPick: window.showQuickPick, showWarningMessage: window.showWarningMessage, showInformationMessage: window.showInformationMessage };
        let messages: string[];
        let picked: string[] | undefined;

        setup(() => {
            messages = [];
            picked = undefined;
            // choose the preselected kinds, confirm the move, dismiss the rest
            window.showQuickPick = async (items: vscode.QuickPickItem[]) => {
                picked = items.map(item => item.label);
                return items.filter(item => item.picked);
            };
            window.showWarningMessage = async (message: string, _options: unknown, ...actions: string[]) => {
                messages.push(message);
                return actions[0];
            };
            window.showInformationMessage = async (message: string) => { messages.push(message); return undefined; };
        });

        teardown(async () => {
            Object.assign(window, original);
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        });

        async function seed(): Promise<void> {
            await write('2026/10/09.md', '# Friday\n\n- NOTE: [Konzept](./09/Konzept.md)\n');
            await write('2026/10/09/Konzept.md', '# Konzept\n');
            await write('2026/10/12.md', '# Monday (old)\n');
            await write('2026/2026-10-12.md', '# Monday (new)\n');
        }
        const run = async () => {
            const command = new (MigrateLayoutCommand as any)(ctrl) as MigrateLayoutCommand;
            await command.execute();
            return command.panel!;
        };

        test('the dry run lists moves, link changes and conflicts and changes nothing; closing it is preview only', async () => {
            await seed();
            const panel = await run();

            assert.deepStrictEqual(picked, ['Daily entries', 'Notes'], 'only kinds with files');
            assert.ok(panel.html.includes('<td class="path">2026/10/09.md</td><td class="path">2026/2026-10-09.md</td>'), 'the move');
            assert.ok(panel.html.includes('<td class="path">./09/Konzept.md</td><td class="path">10/09/Konzept.md</td>'), 'the link change');
            assert.ok(panel.html.includes('<td class="path">2026/10/12.md</td><td class="path">2026/2026-10-12.md</td>'), 'the conflict');
            assert.ok(await fileExists(ctrl.fs, at('2026', '10', '09.md')), 'nothing moved yet');

            await panel.handle({ type: 'close' });
            assert.ok(await fileExists(ctrl.fs, at('2026', '10', '09.md')), 'preview only: nothing moved');
            assert.ok(!(await fileExists(ctrl.fs, at('2026', '2026-10-09.md'))));
        });

        test('Move moves the files, updates the links and shows the result; notes only on request', async () => {
            await seed();
            const panel = await run();
            await panel.handle({ type: 'move' });

            assert.ok(panel.html.includes('Moved 1 files, updated the links in 1 files.'), panel.html);
            const moved = new TextDecoder().decode(await ctrl.fs.readFile(at('2026', '2026-10-09.md')));
            assert.strictEqual(moved, '# Friday\n\n- NOTE: [Konzept](10/09/Konzept.md)\n');
            assert.ok(await fileExists(ctrl.fs, at('2026', '10', '09', 'Konzept.md')), 'notes were not chosen');
            assert.ok(await fileExists(ctrl.fs, at('2026', '10', '12.md')), 'the conflict stays');
        });

        test('nothing to migrate', async () => {
            await write('2026/2026-10-09.md');
            await (new (MigrateLayoutCommand as any)(ctrl) as MigrateLayoutCommand).execute();
            assert.deepStrictEqual(messages, ['Nothing to migrate: all journal files are in the current layout.']);
            assert.strictEqual(picked, undefined);
        });
    });

    test('the notes of a day in the earlier notes folder are linked', async () => {
        const old = await write('2026/10/09/Konzept.md', '# Konzept\n');
        const current = await write('notes/2026-10-09_Review.md', '# Review\n');
        const notes = await new SyncNoteLinks(ctrl).getFilesInNotesFolder(new Date(2026, 9, 9), SCOPE_DEFAULT);
        assert.deepStrictEqual(notes.map(uri => uri.fsPath).sort(), [old, current].sort());
    });
});
