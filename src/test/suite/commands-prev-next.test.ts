import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as J from '../..';
import { TestLogger } from '../test-logger';
import {
    addDays,
    daysBetween,
    findAdjacentEntry,
    getAdjacentWeekInput,
    resolveAnchor,
    stripTime,
} from '../../actions/navigation';
import { SCOPE_DEFAULT } from '../../ext';
import { OpenNextEntryCommand } from '../../provider/commands/open-next-entry';
import { OpenPreviousEntryCommand } from '../../provider/commands/open-previous-entry';

async function seedEntry(base: string, year: number, month: number, day: number, content = '# Entry\n'): Promise<string> {
    const yy = String(year).padStart(4, '0');
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const dir = vscode.Uri.file(path.join(base, yy, mm));
    await vscode.workspace.fs.createDirectory(dir);
    const file = vscode.Uri.file(path.join(base, yy, mm, `${dd}.md`));
    await vscode.workspace.fs.writeFile(file, new TextEncoder().encode(content));
    return file.fsPath;
}

async function buildCtrl(tmpBase: string): Promise<{ ctrl: J.Util.Ctrl; logger: TestLogger }> {
    const config = vscode.workspace.getConfiguration('journal');
    await config.update('base', tmpBase, vscode.ConfigurationTarget.Workspace);
    const refreshed = vscode.workspace.getConfiguration('journal');
    const ctrl = new J.Util.Ctrl(refreshed);
    const logger = new TestLogger(false);
    ctrl.logger = logger;
    return { ctrl, logger };
}

suite('Issue #144 — Open Previous / Open Next navigation', () => {

    suite('date helpers', () => {
        test('stripTime zeroes hours/minutes/seconds', () => {
            const d = new Date(2025, 2, 8, 14, 30, 45);
            const stripped = stripTime(d);
            assert.strictEqual(stripped.getHours(), 0);
            assert.strictEqual(stripped.getMinutes(), 0);
            assert.strictEqual(stripped.getSeconds(), 0);
        });

        test('addDays advances and rolls into the next month', () => {
            const d = new Date(2025, 2, 30); // 2025-03-30
            const plus5 = addDays(d, 5);
            assert.strictEqual(plus5.getFullYear(), 2025);
            assert.strictEqual(plus5.getMonth(), 3); // April
            assert.strictEqual(plus5.getDate(), 4);
        });

        test('daysBetween counts integer days', () => {
            const a = new Date(2025, 2, 1);
            const b = new Date(2025, 2, 8);
            assert.strictEqual(daysBetween(a, b), 7);
            assert.strictEqual(daysBetween(b, a), -7);
        });
    });

    suite('helper layer with seeded base', () => {
        let originalBase: string | undefined;
        let originalMode: string | undefined;
        let tmpBase: string;
        let ctrl: J.Util.Ctrl;

        setup(async () => {
            const config = vscode.workspace.getConfiguration('journal');
            originalBase = config.get<string>('base');
            originalMode = config.get<string>('navigation.mode');

            tmpBase = path.join(os.tmpdir(), `issue144-base-${Date.now()}`);
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(tmpBase));
            await config.update('navigation.mode', 'existing', vscode.ConfigurationTarget.Workspace);

            ({ ctrl } = await buildCtrl(tmpBase));
        });

        teardown(async () => {
            const config = vscode.workspace.getConfiguration('journal');
            await config.update('base', originalBase, vscode.ConfigurationTarget.Workspace);
            await config.update('navigation.mode', originalMode, vscode.ConfigurationTarget.Workspace);
            try { await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true }); } catch { /* ignore */ }
        });

        test('resolveAnchor falls back to today when no editor is open', async () => {
            const anchor = await resolveAnchor(ctrl, undefined);
            assert.strictEqual(anchor.scope, SCOPE_DEFAULT);
            const today = stripTime(new Date());
            assert.strictEqual(anchor.date.getTime(), today.getTime());
        });

        test('findAdjacentEntry(existing, previous) finds the prior on-disk entry', async () => {
            await seedEntry(tmpBase, 2025, 3, 5);
            await seedEntry(tmpBase, 2025, 3, 8);
            await seedEntry(tmpBase, 2025, 3, 12);

            const target = await findAdjacentEntry(
                ctrl,
                { date: new Date(2025, 2, 8), scope: SCOPE_DEFAULT },
                'previous',
                'existing',
            );
            assert.ok(target, 'expected a target date');
            assert.strictEqual(target!.getFullYear(), 2025);
            assert.strictEqual(target!.getMonth(), 2);
            assert.strictEqual(target!.getDate(), 5);
        });

        test('findAdjacentEntry(existing, next) finds the next on-disk entry', async () => {
            await seedEntry(tmpBase, 2025, 3, 5);
            await seedEntry(tmpBase, 2025, 3, 8);
            await seedEntry(tmpBase, 2025, 3, 12);

            const target = await findAdjacentEntry(
                ctrl,
                { date: new Date(2025, 2, 8), scope: SCOPE_DEFAULT },
                'next',
                'existing',
            );
            assert.ok(target);
            assert.strictEqual(target!.getDate(), 12);
        });

        test('findAdjacentEntry(existing, previous) returns null at the start of history', async () => {
            await seedEntry(tmpBase, 2025, 3, 5);
            await seedEntry(tmpBase, 2025, 3, 8);

            const target = await findAdjacentEntry(
                ctrl,
                { date: new Date(2025, 2, 5), scope: SCOPE_DEFAULT },
                'previous',
                'existing',
            );
            assert.strictEqual(target, null);
        });

        test('findAdjacentEntry(existing, next) returns null at the end of history', async () => {
            await seedEntry(tmpBase, 2025, 3, 5);
            await seedEntry(tmpBase, 2025, 3, 8);

            const target = await findAdjacentEntry(
                ctrl,
                { date: new Date(2025, 2, 8), scope: SCOPE_DEFAULT },
                'next',
                'existing',
            );
            assert.strictEqual(target, null);
        });

        test('findAdjacentEntry(calendar, previous) returns anchor - 1d regardless of disk', async () => {
            const target = await findAdjacentEntry(
                ctrl,
                { date: new Date(2025, 2, 8), scope: SCOPE_DEFAULT },
                'previous',
                'calendar',
            );
            assert.ok(target);
            assert.strictEqual(target!.getDate(), 7);
        });

        test('findAdjacentEntry(calendar, next) returns anchor + 1d regardless of disk', async () => {
            const target = await findAdjacentEntry(
                ctrl,
                { date: new Date(2025, 2, 8), scope: SCOPE_DEFAULT },
                'next',
                'calendar',
            );
            assert.ok(target);
            assert.strictEqual(target!.getDate(), 9);
        });

        test('findAdjacentEntry crosses year boundaries', async () => {
            await seedEntry(tmpBase, 2024, 12, 30);
            await seedEntry(tmpBase, 2025, 1, 5);

            const target = await findAdjacentEntry(
                ctrl,
                { date: new Date(2024, 11, 30), scope: SCOPE_DEFAULT },
                'next',
                'existing',
            );
            assert.ok(target);
            assert.strictEqual(target!.getFullYear(), 2025);
            assert.strictEqual(target!.getMonth(), 0);
            assert.strictEqual(target!.getDate(), 5);
        });
    });

    suite('command layer', () => {
        let originalBase: string | undefined;
        let originalMode: string | undefined;
        let tmpBase: string;
        let ctrl: J.Util.Ctrl;
        let infoMessages: string[];
        let originalShowInfo: typeof vscode.window.showInformationMessage;

        setup(async () => {
            const config = vscode.workspace.getConfiguration('journal');
            originalBase = config.get<string>('base');
            originalMode = config.get<string>('navigation.mode');

            tmpBase = path.join(os.tmpdir(), `issue144-cmd-${Date.now()}`);
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(tmpBase));
            await config.update('navigation.mode', 'existing', vscode.ConfigurationTarget.Workspace);

            ({ ctrl } = await buildCtrl(tmpBase));

            infoMessages = [];
            originalShowInfo = vscode.window.showInformationMessage;
            (vscode.window as any).showInformationMessage = async (msg: string, ..._rest: any[]) => {
                infoMessages.push(msg);
                return undefined;
            };
        });

        teardown(async () => {
            (vscode.window as any).showInformationMessage = originalShowInfo;
            const config = vscode.workspace.getConfiguration('journal');
            await config.update('base', originalBase, vscode.ConfigurationTarget.Workspace);
            await config.update('navigation.mode', originalMode, vscode.ConfigurationTarget.Workspace);
            try { await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true }); } catch { /* ignore */ }
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        });

        test('OpenPreviousEntryCommand opens the prior on-disk entry', async () => {
            const prevPath = await seedEntry(tmpBase, 2025, 3, 5);
            const anchorPath = await seedEntry(tmpBase, 2025, 3, 8);
            await seedEntry(tmpBase, 2025, 3, 12);

            const anchorDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(anchorPath));
            await vscode.window.showTextDocument(anchorDoc);

            const cmdInstance = new (OpenPreviousEntryCommand as any)(ctrl);
            await cmdInstance.run();

            const active = vscode.window.activeTextEditor;
            assert.ok(active, 'expected an active editor');
            assert.strictEqual(path.normalize(active!.document.uri.fsPath), path.normalize(prevPath));
        });

        test('OpenPreviousEntryCommand shows toast at the start of history', async () => {
            const oldestPath = await seedEntry(tmpBase, 2025, 3, 5);
            const oldestDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(oldestPath));
            await vscode.window.showTextDocument(oldestDoc);

            const cmdInstance = new (OpenPreviousEntryCommand as any)(ctrl);
            await cmdInstance.run();

            assert.ok(infoMessages.some(m => /No earlier journal entry/i.test(m)),
                `expected info toast; got ${JSON.stringify(infoMessages)}`);
            const active = vscode.window.activeTextEditor;
            assert.strictEqual(path.normalize(active!.document.uri.fsPath), path.normalize(oldestPath));
        });

        test('OpenNextEntryCommand in calendar mode creates the next-day entry', async () => {
            const config = vscode.workspace.getConfiguration('journal');
            await config.update('navigation.mode', 'calendar', vscode.ConfigurationTarget.Workspace);

            // Use yesterday as anchor so next = today; offset is -1 (no large DST-sensitive arithmetic).
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const anchorPath = await seedEntry(
                tmpBase,
                yesterday.getFullYear(),
                yesterday.getMonth() + 1,
                yesterday.getDate(),
            );
            const anchorDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(anchorPath));
            await vscode.window.showTextDocument(anchorDoc);

            const cmdInstance = new (OpenNextEntryCommand as any)(ctrl);
            await cmdInstance.run();

            const today = new Date();
            const expectedPath = path.join(
                tmpBase,
                String(today.getFullYear()).padStart(4, '0'),
                String(today.getMonth() + 1).padStart(2, '0'),
                `${String(today.getDate()).padStart(2, '0')}.md`,
            );
            try {
                const stat = await vscode.workspace.fs.stat(vscode.Uri.file(expectedPath));
                assert.ok(stat, 'expected next-day entry to exist on disk');
            } catch (err) {
                assert.fail(`next-day entry was not created: ${err}`);
            }
        });
    });

    suite('scoped navigation (#144 scope isolation)', function () {
        this.slow(8000);

        let originalBase: string | undefined;
        let originalMode: string | undefined;
        let originalScopes: unknown;
        let tmpBase: string;
        let workBase: string;
        let ctrl: J.Util.Ctrl;

        setup(async () => {
            const config = vscode.workspace.getConfiguration('journal');
            originalBase = config.get<string>('base');
            originalMode = config.get<string>('navigation.mode');
            originalScopes = config.get('scopes');

            tmpBase = path.join(os.tmpdir(), `issue144-scoped-${Date.now()}`);
            workBase = path.join(tmpBase, 'work');
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(tmpBase));
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(workBase));

            await config.update('scopes', [{ name: 'work', base: workBase }], vscode.ConfigurationTarget.Workspace);
            await config.update('navigation.mode', 'existing', vscode.ConfigurationTarget.Workspace);

            ({ ctrl } = await buildCtrl(tmpBase));
        });

        teardown(async () => {
            const config = vscode.workspace.getConfiguration('journal');
            await config.update('base', originalBase, vscode.ConfigurationTarget.Workspace);
            await config.update('navigation.mode', originalMode, vscode.ConfigurationTarget.Workspace);
            await config.update('scopes', originalScopes, vscode.ConfigurationTarget.Workspace);
            try { await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true }); } catch { /* ignore */ }
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        });

        async function seedScopedEntry(base: string, year: number, month: number, day: number): Promise<string> {
            const yy = String(year).padStart(4, '0');
            const mm = String(month).padStart(2, '0');
            const dd = String(day).padStart(2, '0');
            const dir = vscode.Uri.file(path.join(base, yy, mm));
            await vscode.workspace.fs.createDirectory(dir);
            const file = vscode.Uri.file(path.join(base, yy, mm, `${dd}.md`));
            await vscode.workspace.fs.writeFile(file, new TextEncoder().encode('# Scoped Entry\n'));
            return file.fsPath;
        }

        test('happy: findAdjacentEntry returns prior entry in work scope (not default scope)', async () => {
            // Seed two entries in the work scope base
            await seedScopedEntry(workBase, 2025, 3, 5);
            await seedScopedEntry(workBase, 2025, 3, 8);
            // Seed a default scope entry that must NOT be returned
            await seedEntry(tmpBase, 2025, 3, 7);

            const anchor: { date: Date; scope: string } = { date: new Date(2025, 2, 8), scope: 'work' };
            const prev = await findAdjacentEntry(ctrl, anchor, 'previous', 'existing');

            assert.ok(prev, 'expected a previous entry date');
            assert.strictEqual(prev!.getDate(), 5, `expected day 5, got ${prev!.getDate()}`);
            assert.strictEqual(prev!.getMonth(), 2, `expected March, got month ${prev!.getMonth()}`);
        });

        test('error: findAdjacentEntry returns null at start of scoped history', async () => {
            // Only one entry in work scope — no earlier entry
            await seedScopedEntry(workBase, 2025, 3, 5);

            const anchor: { date: Date; scope: string } = { date: new Date(2025, 2, 5), scope: 'work' };
            const prev = await findAdjacentEntry(ctrl, anchor, 'previous', 'existing');

            assert.ok(prev === null || prev === undefined, `expected null at start of history, got ${prev}`);
        });
    });

    suite('getAdjacentWeekInput (#200)', () => {
        let originalBase: string | undefined;
        let tmpBase: string;
        let ctrl: J.Util.Ctrl;

        setup(async () => {
            const config = vscode.workspace.getConfiguration('journal');
            originalBase = config.get<string>('base');
            tmpBase = path.join(os.tmpdir(), `issue200-week-${Date.now()}`);
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(tmpBase));
            ({ ctrl } = await buildCtrl(tmpBase));
        });

        teardown(async () => {
            const config = vscode.workspace.getConfiguration('journal');
            await config.update('base', originalBase, vscode.ConfigurationTarget.Workspace);
            try { await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true }); } catch { /* ignore */ }
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        });

        async function seedWeeklyFile(base: string, year: number, week: number): Promise<string> {
            const yearDir = vscode.Uri.file(path.join(base, String(year).padStart(4, '0')));
            await vscode.workspace.fs.createDirectory(yearDir);
            const file = vscode.Uri.file(path.join(base, String(year).padStart(4, '0'), `w${week}.md`));
            await vscode.workspace.fs.writeFile(file, new TextEncoder().encode(`# Week ${week}\n`));
            return file.fsPath;
        }

        test('T1: editor=undefined returns undefined', async () => {
            const result = await getAdjacentWeekInput(undefined, ctrl, 'next');
            assert.strictEqual(result, undefined);
        });

        test('T2: non-weekly day file returns undefined', async () => {
            const dayPath = await seedEntry(tmpBase, 2026, 5, 16);
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(dayPath));
            await vscode.window.showTextDocument(doc);
            const result = await getAdjacentWeekInput(vscode.window.activeTextEditor, ctrl, 'next');
            assert.strictEqual(result, undefined);
        });

        test('T3: weekly file + direction next → week+1', async () => {
            const weeklyPath = await seedWeeklyFile(tmpBase, 2026, 20);
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(weeklyPath));
            await vscode.window.showTextDocument(doc);
            const result = await getAdjacentWeekInput(vscode.window.activeTextEditor, ctrl, 'next');
            assert.ok(result, 'expected an Input back');
            assert.strictEqual(result!.week, 21);
        });

        test('T4: weekly file + direction previous → week-1', async () => {
            const weeklyPath = await seedWeeklyFile(tmpBase, 2026, 20);
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(weeklyPath));
            await vscode.window.showTextDocument(doc);
            const result = await getAdjacentWeekInput(vscode.window.activeTextEditor, ctrl, 'previous');
            assert.ok(result, 'expected an Input back');
            assert.strictEqual(result!.week, 19);
        });
    });
});
