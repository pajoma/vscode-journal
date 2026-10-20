import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { DEFAULT_PATTERNS } from 'journal-core';
import { Container } from '../../app/index';
import { CalendarPanel } from '../../features/calendar/calendar-panel';
import { OpenCalendarCommand } from '../../features/calendar/commands/open-calendar';
import { OpenDayCommand } from '../../features/calendar/commands/open-day';
import { OpenWeekCommand } from '../../features/calendar/commands/open-week';
import { NavigationLensProvider } from '../../features/calendar/navigation-lens';
import { JournalIndex } from '../../shared/journal/journal-index';
import { fileExists } from '../../shared/index';
import { FakeWorkspaceConfig } from '../fake-workspace-config';
import { TestLogger } from '../test-logger';

/** Quick navigation between day, week and month: CodeLens, commands, calendar (#311). */
suite('Issue #311 — navigation between day, week and month', () => {
    let base: string;
    let ctrl: Container;
    let index: JournalIndex;
    let panel: CalendarPanel | undefined;

    const at = (...parts: string[]) => path.join(base, ...parts);
    async function write(file: string, text = '# entry\n'): Promise<string> {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(at(file))));
        await vscode.workspace.fs.writeFile(vscode.Uri.file(at(file)), new TextEncoder().encode(text));
        return at(file);
    }
    async function until(condition: () => boolean, what: string): Promise<void> {
        for (let i = 0; i < 40 && !condition(); i++) { await new Promise(resolve => setTimeout(resolve, 100)); }
        assert.ok(condition(), what);
    }

    setup(async () => {
        base = path.join(os.tmpdir(), `issue311-${Date.now()}`);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(base));
        // the default patterns, as VS Code returns them from the manifest
        ctrl = new Container(new FakeWorkspaceConfig({ base, locale: 'en', patterns: DEFAULT_PATTERNS }), () => new TestLogger(false));
        index = new JournalIndex(ctrl);
    });

    teardown(async () => {
        panel?.dispose();
        panel = undefined;
        index.dispose();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        try { await vscode.workspace.fs.delete(vscode.Uri.file(base), { recursive: true }); } catch { /* ignore */ }
    });

    test('CodeLens of a daily entry: its week and its month', async () => {
        const doc = await vscode.workspace.openTextDocument(await write('2026/10/20.md'));
        const lenses = await new NavigationLensProvider(ctrl, index).provideCodeLenses(doc);
        assert.deepStrictEqual(lenses.map(l => [l.command!.title, l.command!.command, l.command!.arguments]), [
            ['$(arrow-up) Week 43', 'journal.openWeek', [43, 2026]],
            ['$(calendar) October 2026', 'journal.openCalendar', [2026, 10]],
        ]);
    });

    test('CodeLens of a weekly entry: its seven days (missing ones with +) and the months it touches', async () => {
        await write('2026/10/26.md');
        const doc = await vscode.workspace.openTextDocument(await write('2026/week_44.md'));
        const lenses = await new NavigationLensProvider(ctrl, index).provideCodeLenses(doc);
        assert.deepStrictEqual(lenses.map(l => l.command!.title), [
            '$(add) Su 25', 'Mo 26', '$(add) Tu 27', '$(add) We 28', '$(add) Th 29', '$(add) Fr 30', '$(add) Sa 31',
            '$(calendar) October 2026',
        ], 'week 44 (English weeks start on Sunday) lies in October');
        assert.deepStrictEqual(lenses[1].command!.arguments, ['2026-10-26'], 'a day opens with its date');
    });

    test('a CodeLens click on a missing day creates its entry; Open Week goes from a day to its week', async () => {
        const created = await (new (OpenDayCommand as any)(ctrl) as OpenDayCommand).execute('2026-10-27');
        assert.strictEqual(created, at('2026', '10', '27.md'));
        assert.ok(await fileExists(ctrl.fs, created!), 'created');

        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(created!));
        const week = await (new (OpenWeekCommand as any)(ctrl) as OpenWeekCommand).execute();
        assert.strictEqual(week, at('2026', 'week_44.md'), 'the week of the active entry');
    });

    test('the calendar: the month of the active entry, days with tasks and notes, clicks create entries, month navigation', async () => {
        await write('2026/10/19.md', '# Monday\n\n- [ ] open\n- [x] done\n- NOTE: [Konzept](19/Konzept.md)\n');
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(await write('2026/10/20.md')));
        panel = await (new (OpenCalendarCommand as any)(ctrl, index) as OpenCalendarCommand).execute();
        await until(() => panel!.html.includes('<h1>October 2026</h1>'), 'the month of the active entry');
        assert.ok(panel!.html.includes('<button class="day open" data-day="2026-10-19"'), 'open tasks marked');
        assert.ok(panel!.html.includes('<span class="tasks">⚠ 1/2</span><span class="notes">1 note</span>'), 'counts');
        assert.ok(panel!.html.includes('<button class="day missing" data-day="2026-10-21"'), 'a day without entry');

        await panel!.handle({ type: 'day', key: '2026-10-21' });
        assert.ok(await fileExists(ctrl.fs, at('2026', '10', '21.md')), 'a click creates the entry');
        await until(() => !panel!.html.includes('<button class="day missing" data-day="2026-10-21"'), 'the day is no longer missing');

        await panel!.handle({ type: 'month', year: 2027, month: 1 });
        await until(() => panel!.html.includes('<h1>January 2027</h1>'), 'next months');
    });

    test('the calendar follows the active journal file', async () => {
        panel = CalendarPanel.show(ctrl, index, new Date(2026, 9, 1));
        await until(() => panel!.html.includes('<h1>October 2026</h1>'), 'October');
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(await write('2026/03/14.md')));
        await until(() => panel!.html.includes('<h1>March 2026</h1>'), 'the month of the opened entry');
    });
});
