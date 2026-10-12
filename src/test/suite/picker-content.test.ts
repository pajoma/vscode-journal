import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { Parser } from '../../features/smart-input/parser';
import { mergeSorted, PickerContent, PickItem, withPlaceholder } from '../../features/smart-input/picker-content';
import { Picker } from '../../features/smart-input/picker';
import { ScanEntries } from '../../features/smart-input/scan-entries';
import { Configuration } from '../../shared/config/configuration';
import { FileEntry, Input, JournalPageType, SelectedInput } from '../../shared/model/index';
import { FakeWorkspaceConfig } from '../fake-workspace-config';
import { TestLogger } from '../test-logger';

const base = path.join('/tmp', 'journal-picker');

function content(settings: Record<string, unknown> = {}, folders: string[] = []): { content: PickerContent; config: Configuration } {
    const config = new Configuration(new FakeWorkspaceConfig({ base, ...settings }));
    config.setScopeFolders(folders);
    return { content: new PickerContent(config, new Parser(config, new TestLogger(false))), config };
}

const entry = (file: string, type: JournalPageType, scope = 'default', updateAt = 0): FileEntry =>
    ({ path: path.join(base, file), name: path.basename(file), scope, type, updateAt, createdAt: updateAt, accessedAt: updateAt });

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
        const scanner = { getPreviouslyAccessedFiles: async () => undefined } as unknown as ScanEntries;
        picker = new Picker(c, scanner, config, new TestLogger(false));
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
});
