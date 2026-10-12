import * as assert from 'assert';
import * as path from 'path';
import { Parser } from '../../features/smart-input/parser';
import { mergeSorted, PickerContent, PickItem, withPlaceholder } from '../../features/smart-input/picker-content';
import { Configuration } from '../../shared/config/configuration';
import { FileEntry, JournalPageType } from '../../shared/model/index';
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

    test('noteItem detects the typed scope and resolves the path in it', async () => {
        const { content: c, config } = content({}, ['vera']);
        const item = await c.noteItem('Konzept #vera');
        assert.ok(item.description!.startsWith('Create new note in scope "vera"'), item.description);
        assert.ok(item.path.startsWith(path.join(config.getScopeRoot(), 'vera')), `note goes into the scope folder: ${item.path}`);
        assert.strictEqual(item.replace, true);
    });
});
