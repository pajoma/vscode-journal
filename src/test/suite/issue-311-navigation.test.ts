import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { DEFAULT_PATTERNS } from 'journal-core';
import { Container } from '../../app/index';
import { CalendarPanel } from '../../features/calendar/calendar-panel';
import { OpenCalendarCommand } from '../../features/calendar/commands/open-calendar';
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

    test('CodeLens of a daily entry: previous day · its week · next day (the nearest entries)', async () => {
        await write('2026/10/16.md');
        await write('2026/10/22.md');
        const doc = await vscode.workspace.openTextDocument(await write('2026/10/20.md'));
        const lenses = await new NavigationLensProvider(ctrl, index).provideCodeLenses(doc);
        assert.deepStrictEqual(lenses.map(l => [l.command!.title, l.command!.command, l.command!.arguments]), [
            ['$(arrow-left) Fr, Oct 16, 2026', 'journal.openDay', ['2026-10-16']],
            ['$(arrow-up) Week 43', 'journal.openWeek', [43, 2026]],
            ['Th, Oct 22, 2026 $(arrow-right)', 'journal.openDay', ['2026-10-22']],
        ], 'navigation.mode existing: skips the days without entry');

        const first = await vscode.workspace.openTextDocument(at('2026', '10', '16.md'));
        assert.deepStrictEqual((await new NavigationLensProvider(ctrl, index).provideCodeLenses(first)).map(l => l.command!.title),
            ['$(arrow-up) Week 42', 'Tu, Oct 20, 2026 $(arrow-right)'], 'no previous day at the start of the journal');
    });

    test('CodeLens with navigation.mode calendar: the day and the week before and after', async () => {
        const calendar = new Container(new FakeWorkspaceConfig({ base, locale: 'en', patterns: DEFAULT_PATTERNS, 'navigation.mode': 'calendar' }), () => new TestLogger(false));
        const calendarIndex = new JournalIndex(calendar);
        try {
            const day = await vscode.workspace.openTextDocument(await write('2026/10/20.md'));
            assert.deepStrictEqual((await new NavigationLensProvider(calendar, calendarIndex).provideCodeLenses(day)).map(l => l.command!.arguments![0]),
                ['2026-10-19', 43, '2026-10-21'], 'yesterday and tomorrow, with or without entry');
            const week = await vscode.workspace.openTextDocument(await write('2026/week_52.md'));
            assert.deepStrictEqual((await new NavigationLensProvider(calendar, calendarIndex).provideCodeLenses(week)).map(l => l.command!.arguments),
                [[51, 2026], [2026, 12], [1, 2027]], 'English weeks: 2026 has 52, week 52 is followed by week 1 of 2027');
        } finally {
            calendarIndex.dispose();
        }
    });

    test('CodeLens of a weekly entry: previous week · its month(s) · next week (its days are links in its markdown)', async () => {
        await write('2026/week_42.md');
        await write('2026/week_45.md');
        const october = await vscode.workspace.openTextDocument(await write('2026/week_44.md'));
        const lenses = await new NavigationLensProvider(ctrl, index).provideCodeLenses(october);
        assert.deepStrictEqual(lenses.map(l => [l.command!.title, l.command!.arguments]), [
            ['$(arrow-left) Week 42', [42, 2026]],
            ['$(calendar) October 2026', [2026, 10]],
            ['Week 45 $(arrow-right)', [45, 2026]],
        ], 'the nearest weekly entries; week 44 (from Sunday 25) lies in October');
        const last = await vscode.workspace.openTextDocument(at('2026', 'week_45.md'));
        assert.deepStrictEqual((await new NavigationLensProvider(ctrl, index).provideCodeLenses(last)).map(l => l.command!.title),
            ['$(arrow-left) Week 44', '$(calendar) November 2026'], 'week 45 starts on Sunday, November 1; no next week');
    });

    test('CodeLens of a note: the pages that link to it (backlinks), by markdown or wiki link; more than five in a picker', async () => {
        const note = await write('2026/10/20/Konzept.md', '# Konzept\n');
        await write('2026/10/20.md', '# Tuesday\n\n- NOTE: [Konzept](20/Konzept.md)\n');
        await write('2026/week_43.md', '# Week 43\n\nsee [[Konzept]]\n');
        await write('2026/10/21.md', '# Wednesday\n\n[web](https://example.com) and [[Other]]\n');
        const doc = await vscode.workspace.openTextDocument(note);
        const lenses = await new NavigationLensProvider(ctrl, index).provideCodeLenses(doc);
        assert.deepStrictEqual(lenses.map(l => l.command!.title), ['$(arrow-up) Tu, 2026-10-20', '$(arrow-up) Week 43 2026'], 'the entry and the week, not the unrelated day');
        assert.deepStrictEqual([lenses[0].command!.command, (lenses[0].command!.arguments![0] as vscode.Uri).fsPath], ['vscode.open', at('2026', '10', '20.md')]);

        for (const day of [22, 23, 24, 25, 26]) { await write(`2026/10/${day}.md`, '[[Konzept]]\n'); }
        index.invalidate();
        const many = await new NavigationLensProvider(ctrl, index).provideCodeLenses(doc);
        assert.strictEqual(many.length, 6, 'five backlinks and one for the rest');
        assert.deepStrictEqual([many[5].command!.title, many[5].command!.command, (many[5].command!.arguments![0] as string[]).length],
            ['$(arrow-up) 2 more', 'journal.pickBacklink', 7]);
    });

    test('Open Week goes from a day to its week, created if missing', async () => {
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(await write('2026/10/27.md')));
        const week = await (new (OpenWeekCommand as any)(ctrl) as OpenWeekCommand).execute();
        assert.strictEqual(week, at('2026', 'week_44.md'), 'the week of the active entry');
        assert.ok(await fileExists(ctrl.fs, week!), 'created');
    });

    test('the calendar: the month of the active entry, days with tasks and notes, clicks create entries, month navigation', async () => {
        await write('2026/10/19.md', '# Monday\n\n- [ ] open\n- [x] done\n- NOTE: [Konzept](19/Konzept.md)\n');
        await write('2026/week_43.md', '# Week 43\n\n## Daily Entries\n\n- [[2026-10-19|Monday]]\n\n## Tasks\n\n- [ ] weekly goal\n- [ ] review\n- [x] plan\n');
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(await write('2026/10/20.md')));
        panel = await (new (OpenCalendarCommand as any)(ctrl, index) as OpenCalendarCommand).execute();
        await until(() => panel!.html.includes('<h1>October 2026</h1>'), 'the month of the active entry');
        assert.ok(panel!.html.includes('<button class="day open" data-day="2026-10-19"'), 'open tasks marked');
        assert.ok(panel!.html.includes('<span class="tasks">⚠ 1/2</span><span class="notes">1 note</span>'), 'counts');
        assert.ok(panel!.html.includes('<button class="day missing" data-day="2026-10-21"'), 'a day without entry');
        assert.ok(panel!.html.includes('<button class="week open" data-week="43" data-year="2026" title="Open week 43 · 2 of 3 tasks open"><span class="number">43</span><span class="tasks">⚠ 2/3</span></button>'),
            'the tasks of the weekly entry, marked while open; its daily links are no notes');

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
