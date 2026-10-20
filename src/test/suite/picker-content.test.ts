import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { Parser } from '../../features/smart-input/parser';
import { decorateSummary, mergeSorted, PickerContent, PickItem, withPlaceholder } from '../../features/smart-input/picker-content';
import { Picker } from '../../features/smart-input/picker';
import { ScanEntries } from '../../features/smart-input/scan-entries';
import { SearchHit, SearchIndex } from '../../features/smart-input/search-index';
import { Configuration } from '../../shared/config/configuration';
import { FileEntry, Input, JournalPageType, SelectedInput } from '../../shared/model/index';
import { FakeWorkspaceConfig } from '../fake-workspace-config';
import { InMemoryFileSystem } from '../in-memory-fs';
import { TestLogger } from '../test-logger';

const base = path.join('/tmp', 'journal-picker');

function content(settings: Record<string, unknown> = {}, folders: string[] = [], fs = new InMemoryFileSystem()): { content: PickerContent; config: Configuration } {
    const config = new Configuration(new FakeWorkspaceConfig({ base, ...settings }));
    config.setScopeFolders(folders);
    return { content: new PickerContent(config, new Parser(config, new TestLogger(false)), fs), config };
}

/** An in-memory journal with the given files (paths below the base). */
function journal(files: Record<string, string>): InMemoryFileSystem {
    const fs = new InMemoryFileSystem();
    for (const [file, text] of Object.entries(files)) {
        void fs.writeFile(path.join(base, file), new TextEncoder().encode(text));
    }
    return fs;
}

const ENTRY_19 = [
    '# Monday, October 19 2026', '', '## Tasks',
    '- [ ] Review PR',
    '- [x] Write minutes (done: 2026-10-19 10:00)',
    '- [>] Plan sprint (moved: [Tuesday](./20.md))',
    '', '## Notes',
    '- NOTE: [Konzept](./19/Konzept.md)',
    '- [Week 43](../week_43.md)',
].join('\n');

const entry = (file: string, type: JournalPageType, scope = 'default', updateAt = 0): FileEntry =>
    ({ path: path.join(base, file), name: path.basename(file), scope, type, updateAt, createdAt: updateAt, accessedAt: updateAt, journalDate: updateAt });

suite('Picker content', () => {

    test('withPlaceholder adds, replaces and removes the typed-input row', () => {
        const fixed: PickItem = { label: 'Today', path: '' };
        const typed = (label: string): PickItem => ({ label, path: '', replace: true });

        const once = withPlaceholder([fixed], typed('a'));
        assert.deepStrictEqual(once.map(i => i.label), ['a', 'Today'], 'added in front');
        assert.deepStrictEqual(withPlaceholder(once, typed('ab')).map(i => i.label), ['ab', 'Today'], 'replaced, not stacked');
        assert.deepStrictEqual(withPlaceholder(once).map(i => i.label), ['Today'], 'removed when the value is cleared');
    });

    test('mergeSorted keeps rows without file in front and sorts file rows', () => {
        const row = (fe: FileEntry): PickItem => ({ label: fe.name, path: fe.path, fileEntry: fe });
        const merged = mergeSorted(
            [{ label: 'typed', path: '', replace: true }],
            [row(entry('old.md', JournalPageType.note, 'default', 1)), row(entry('new.md', JournalPageType.note, 'default', 2))],
        );
        assert.strictEqual(merged[0].label, 'typed', 'placeholder stays first');
        assert.deepStrictEqual(merged.slice(1).map(i => i.label), ['new.md', 'old.md'], 'most recent file first');
    });

    test('file rows are sorted by the journal date, not by modification time (#300)', () => {
        const row = (fe: FileEntry): PickItem => ({ label: fe.name, path: fe.path, fileEntry: fe });
        const copiedAt = new Date(2026, 8, 23).getTime();
        const old = { ...entry('Old.md', JournalPageType.note), updateAt: copiedAt + 1, journalDate: new Date(2019, 2, 14).getTime() };
        const recent = { ...entry('Recent.md', JournalPageType.note), updateAt: copiedAt, journalDate: new Date(2026, 9, 18).getTime() };
        assert.deepStrictEqual(mergeSorted([], [row(old), row(recent)]).map(i => i.label), ['Recent.md', 'Old.md']);
    });

    test('fileItems keeps the requested type, skips listed files and tags scoped notes', () => {
        const { content: c } = content({ scopes: [{ name: 'work' }] });
        const listed: PickItem[] = [{ label: 'x', path: path.join(base, 'listed.md') }];
        const items = c.fileItems([
            entry('listed.md', JournalPageType.note),
            entry('a_note.md', JournalPageType.note),
            entry('w.md', JournalPageType.note, 'work'),
            entry('2026/10/12.md', JournalPageType.entry),
        ], JournalPageType.note, listed);

        assert.deepStrictEqual(items.map(i => i.label), ['$(circle-large-outline) a note', '$(circle-large-filled) w'], 'only notes, listed file skipped, names denormalized');
        assert.ok(items[1].description!.endsWith(' | #work'), 'scoped notes show their scope');
        assert.ok(!items[0].description!.includes('#'), 'default notes show no scope');
    });

    test('entry rows show the clock as their icon, not in the label (#7)', () => {
        const [row] = content().content.fileItems([entry('2026/10/12.md', JournalPageType.entry)], JournalPageType.entry, []);
        assert.strictEqual(row.label, path.join('10', '12.md'));
        assert.strictEqual((row.iconPath as vscode.ThemeIcon).id, 'clock');
    });

    test('decorateSummary: yellow warning while tasks are open, green check when all are done, notes as detail (#7)', () => {
        const icon = (open: number, tasks: number) => decorateSummary({ open, tasks, notes: 0 }).iconPath;
        assert.strictEqual(icon(2, 5)!.id, 'warning');
        assert.strictEqual(icon(2, 5)!.color!.id, 'charts.yellow');
        assert.strictEqual(icon(0, 3)!.id, 'check');
        assert.strictEqual(icon(0, 3)!.color!.id, 'charts.green');
        assert.strictEqual(icon(0, 0), undefined, 'no tasks: the icon stays');
        assert.strictEqual(decorateSummary({ open: 1, tasks: 1, notes: 3 }).detail, '3 notes', 'no task counts in the detail line');
        assert.strictEqual(decorateSummary({ open: 0, tasks: 0, notes: 1 }).detail, '1 note');
        assert.strictEqual(decorateSummary({ open: 1, tasks: 1, notes: 0 }).detail, undefined);
    });

    test('entryDecoration counts the notes, not the links to daily or weekly entries (#7)', async () => {
        const { content: c } = content({}, [], journal({ '2026/10/19.md': ENTRY_19, '2026/10/18.md': '# Sunday\n' }));
        const decoration = await c.entryDecoration(entry('2026/10/19.md', JournalPageType.entry));
        assert.strictEqual(decoration?.iconPath?.id, 'warning');
        assert.strictEqual(decoration?.detail, '1 note');
        assert.deepStrictEqual(await c.entryDecoration(entry('2026/10/18.md', JournalPageType.entry)), {}, 'nothing to show');
        assert.strictEqual(await c.entryDecoration(entry('2026/10/17.md', JournalPageType.entry)), undefined, 'unreadable');
    });

    test('scanDirectories covers every scope, cut at the first variable, without duplicates', () => {
        const { content: c, config } = content({
            scopes: [{ name: 'same' }, { name: 'client', base: path.join(base, 'client') }],
        }, ['vera']);
        const dirs = [...c.scanDirectories(JournalPageType.note)];
        assert.deepStrictEqual(dirs, [
            { path: base, scope: 'default' },
            { path: path.join(base, 'client'), scope: 'client' },
            { path: path.join(config.getScopeRoot(), 'vera'), scope: 'vera' },
        ], 'a scope sharing the journal path is scanned once; a folder scope scans its folder');
    });

    test('the search row is shown unless journal.search.enabled is off (#300)', () => {
        assert.ok(content().content.startItems().some(item => item.search));
        assert.ok(!content({ 'search.enabled': false }).content.startItems().some(item => item.search));
    });

        test('the file date is the journal date, not the creation date of the copy (#300)', () => {
        const { content: c } = content();
        const copied = new Date(2026, 8, 23).getTime();
        const note: FileEntry = { ...entry(path.join('2019', '03', '14', 'Kickoff.md'), JournalPageType.note), createdAt: copied, journalDate: new Date(2019, 2, 14).getTime() };
        const description = c.fileDescription(note);
        assert.ok(description.includes('2019'), description);
        assert.ok(!description.includes('2026'), description);
    });

        test('inputItem describes a week as the week, not as a date', async () => {
        const { content: c } = content();
        const item = await c.inputItem('w23');
        assert.ok(!item.description!.includes('Invalid date'), item.description);
        assert.ok(item.description!.includes('23'), item.description);
    });

    test('noteItem detects the typed scope and resolves the path in it', async () => {
        const { content: c, config } = content({}, ['vera']);
        const item = await c.noteItem('Konzept #vera');
        assert.ok(item.description!.startsWith('Create new note in scope "vera"'), item.description);
        assert.ok(item.path.startsWith(path.join(config.getScopeRoot(), 'vera')), `note goes into the scope folder: ${item.path}`);
        assert.strictEqual(item.replace, true);
    });
});

/** A QuickPick double: events can be fired, hide() fires onDidHide like VS Code does. */
class FakeQuickPick {
    items: PickItem[] = [];
    value = '';
    busy = false;
    matchOnDescription = false;
    readonly accept = new vscode.EventEmitter<void>();
    readonly selection = new vscode.EventEmitter<PickItem[]>();
    readonly hidden = new vscode.EventEmitter<void>();
    readonly valueChange = new vscode.EventEmitter<string>();
    onDidAccept = this.accept.event;
    onDidChangeSelection = this.selection.event;
    onDidHide = this.hidden.event;
    onDidChangeValue = this.valueChange.event;
    visible = false;
    show(): void { this.visible = true; }
    hide(): void { if (this.visible) { this.visible = false; this.hidden.fire(); } }
    dispose(): void { this.visible = false; }
    choose(label: string): void {
        this.selection.fire(this.items.filter(i => i.label === label));
        this.accept.fire();
    }
}

suite('Picker cancel', () => {
    const original = vscode.window.createQuickPick;
    let created: FakeQuickPick[] = [];
    let picker: Picker;

    setup(() => {
        created = [];
        (vscode.window as any).createQuickPick = () => {
            // opening a picker hides the visible one, as in VS Code
            created.filter(qp => qp.visible).forEach(qp => qp.hide());
            const qp = new FakeQuickPick();
            created.push(qp);
            return qp;
        };
        const { content: c, config } = content();
        const scanner = {
            getPreviouslyAccessedFiles: async () => undefined,
            getPreviouslyAccessedFilesSync: async () => [],
            clearCache: () => undefined,
        } as unknown as ScanEntries;
        const index = {
            setFiles: () => undefined,
            readChanged: async () => undefined,
            search: (query: string): SearchHit[] => query === 'kickoff'
                ? [{ entry: { path: path.join(base, '2026', '10', '12.md'), name: '12.md', updateAt: 0, createdAt: 0, accessedAt: 0, journalDate: new Date(2026, 9, 12).getTime(), type: JournalPageType.entry }, date: new Date(2026, 9, 12), title: '12', line: 4, text: 'Kickoff with the team' }]
                : [],
        } as unknown as SearchIndex;
        picker = new Picker(c, scanner, index, config, new TestLogger(false));
    });
    teardown(() => { (vscode.window as any).createQuickPick = original; });

    test('Esc on the first picker resolves undefined (no error)', async () => {
        const result = picker.getUserInput();
        created[0].hide();
        assert.strictEqual(await result, undefined);
    });

    test('a choice resolves the input and closes the picker', async () => {
        const result = picker.getUserInput();
        created[0].choose(created[0].items[0].label);
        const input = await result;
        assert.ok(input instanceof Input, 'the "Today" row resolves its input');
        assert.strictEqual(created[0].visible, false, 'the picker is closed after the choice');
    });

    test('opening the second-level picker does not cancel; Esc there resolves undefined', async () => {
        const result = picker.getUserInput();
        const first = created[0];
        first.choose(first.items.find(i => i.pickItem === JournalPageType.note && !i.parsedInput)!.label);
        await new Promise(resolve => setImmediate(resolve));
        assert.strictEqual(created.length, 2, 'the note picker opened');
        created[1].hide();
        assert.strictEqual(await result, undefined);
    });

    test('the typed-input row disappears when the input no longer parses', async () => {
        const settle = () => new Promise(resolve => setTimeout(resolve, 20));
        picker.getUserInput();
        const qp = created[0];
        const type = (value: string) => { qp.value = value; qp.valueChange.fire(value); };

        type('task b');
        await settle();
        assert.strictEqual(qp.items[0].label, 'task b', 'the row mirrors the valid input');

        type('task');
        await settle();
        assert.ok(qp.items.every(i => !i.replace), `no row for an input that does not parse: ${qp.items.map(i => i.label)}`);
        qp.hide();
    });

    test('Enter without a choice in the second-level picker cancels', async () => {
        const result = picker.pickItem(JournalPageType.entry);
        created[0].accept.fire();
        assert.strictEqual(await result, undefined);
        assert.strictEqual(created[0].visible, false);
    });

    test('a file chosen in the second-level picker resolves through the first picker', async () => {
        const result = picker.getUserInput();
        created[0].choose(created[0].items.find(i => i.pickItem === JournalPageType.entry && !i.parsedInput)!.label);
        await new Promise(resolve => setImmediate(resolve));
        const second = created[1];
        second.items = [{ label: 'file', path: path.join(base, '2026', '10', '12.md') }];
        second.choose('file');
        const input = await result;
        assert.ok(input instanceof SelectedInput, 'resolved with the chosen file');
        assert.strictEqual((input as SelectedInput).path, path.join(base, '2026', '10', '12.md'));
    });

    test('the search row opens the search; a hit resolves its file and line (#300)', async () => {
        const result = picker.getUserInput();
        created[0].choose(created[0].items.find(i => i.search)!.label);
        await new Promise(resolve => setTimeout(resolve, 20));
        const search = created[1];
        search.value = 'kickoff';
        search.valueChange.fire('kickoff');
        await new Promise(resolve => setTimeout(resolve, 200));
        assert.strictEqual(search.items.length, 1, 'one hit');
        assert.strictEqual(search.items[0].detail, 'Kickoff with the team');
        search.choose(search.items[0].label);
        const input = await result;
        assert.ok(input instanceof SelectedInput);
        assert.deepStrictEqual([input.path, (input as SelectedInput).line], [path.join(base, '2026', '10', '12.md'), 4]);
    });

    test('entry rows get their tasks and notes once the files are read (#7)', async () => {
        const { content: c, config } = content({}, [], journal({
            '2026/10/19.md': ENTRY_19,
            '2026/10/18.md': '# Sunday\n',
            '2026/10/17.md': '- [x] Shopping (done: 2026-10-17 10:00)\n',
        }));
        const entries = [19, 18, 17].map(day => entry(`2026/10/${day}.md`, JournalPageType.entry, 'default', day));
        const scanner = {
            getPreviouslyAccessedFiles: async (_t: unknown, _type: unknown, _dirs: unknown, onEntries: (e: FileEntry[]) => void) => onEntries(entries),
        } as unknown as ScanEntries;
        const p = new Picker(c, scanner, {} as SearchIndex, config, new TestLogger(false));
        void p.pickItem(JournalPageType.entry);
        const qp = created[created.length - 1];
        for (let i = 0; i < 50 && !qp.items.some(item => item.detail); i++) { await new Promise(r => setTimeout(r, 10)); }
        const row = (day: number) => qp.items.find(item => item.path === path.join(base, `2026/10/${day}.md`))!;
        const icon = (day: number) => (row(day).iconPath as vscode.ThemeIcon).id;
        assert.deepStrictEqual([icon(19), icon(18), icon(17)], ['warning', 'clock', 'check']);
        assert.deepStrictEqual([row(19).detail, row(18).detail, row(17).detail], ['1 note', undefined, undefined]);
        qp.hide();
    });

    test('a refresh that is running is shared, not started twice (#300)', async () => {
        const { content: c, config } = content();
        let scans = 0;
        let release!: () => void;
        const scanner = {
            clearCache: () => undefined,
            getPreviouslyAccessedFilesSync: async () => { scans++; await new Promise<void>(r => { release = r; }); return []; },
        } as unknown as ScanEntries;
        const index = { setFiles: () => undefined, readChanged: async () => undefined } as unknown as SearchIndex;
        const p = new Picker(c, scanner, index, config, new TestLogger(false));

        const atStartup = p.refreshIndex();
        let scanned = false;
        const onSearch = p.refreshIndex(() => { scanned = true; });
        assert.strictEqual(onSearch, atStartup, 'the search waits for the startup build');
        assert.ok(scanned, 'the search shows what is indexed so far');
        release();
        await onSearch;
        assert.strictEqual(scans, 1);

        const later = p.refreshIndex();
        release();
        await later;
        assert.strictEqual(scans, 2, 'a later search scans again');
    });
});
