import * as assert from 'assert';
import * as path from 'path';
import { Inject } from '../../features/entries/inject';
import { Reader } from '../../features/entries/reader';
import { Writer } from '../../features/entries/writer';
import { Configuration } from '../../shared/config/configuration';
import { IEditor, Input, InlineString } from '../../shared/model/index';
import { FakeWorkspaceConfig } from '../fake-workspace-config';
import { InMemoryFileSystem } from '../in-memory-fs';

const silent = { trace() { }, debug() { }, error() { }, printError() { }, showChannel() { } };

/** An editor over in-memory texts: applies inserts like a WorkspaceEdit (later positions first). */
class FakeEditor implements IEditor {
    constructor(public readonly texts: Map<string, string>) { }
    async getText(file: string): Promise<string> { return this.texts.get(file) ?? ''; }
    async insert(inserts: InlineString[]): Promise<void> {
        const sorted = [...inserts].sort((a, b) => b.position.line - a.position.line || b.position.character - a.position.character);
        for (const insert of sorted) {
            const lines = (this.texts.get(insert.path) ?? '').split('\n');
            const line = lines[insert.position.line] ?? '';
            lines[insert.position.line] = line.slice(0, insert.position.character) + insert.value + line.slice(insert.position.character);
            this.texts.set(insert.path, lines.join('\n'));
        }
    }
    async save(): Promise<void> { }
    async show(): Promise<void> { }
}

/** The entries domain (reader, writer, inject) in plain node: paths and text, no vscode (#239). */
suite('Entries domain without VS Code (node)', () => {
    const base = path.join('/tmp', 'journal-unit');
    const day = new Date(2026, 9, 13);

    function services(templates: unknown[] = []) {
        const config = new Configuration(new FakeWorkspaceConfig({ base, templates }));
        const fs = new InMemoryFileSystem();
        const writer = new Writer(config, silent as any, fs);
        const reader = new Reader(config, silent as any, writer, fs);
        return { config, fs, writer, reader };
    }

    test('the reader creates a missing entry from the template and returns its path', async () => {
        const { fs, reader } = services([{ name: 'entry', template: '# ${d:YYYY-MM-DD}\n\n## Tasks\n' }]);
        const entry = await reader.loadEntryForDay(day);
        assert.strictEqual(entry, path.join(base, '2026', '10', '13.md'));
        assert.strictEqual(new TextDecoder().decode(fs.getWrittenContent(entry)), '# 2026-10-13\n\n## Tasks\n');
    });

    test('an existing entry is returned as it is', async () => {
        const { fs, reader } = services();
        const entry = path.join(base, '2026', '10', '13.md');
        await fs.writeFile(entry, new TextEncoder().encode('kept'));
        assert.strictEqual(await reader.loadEntryForDay(day), entry);
        assert.strictEqual(new TextDecoder().decode(fs.getWrittenContent(entry)), 'kept');
    });

    test('a task goes below its "after" heading, a memo below the title', async () => {
        const { config } = services([
            { name: 'task', template: '- [ ] ${input}', after: '## Tasks' },
            { name: 'memo', template: '- MEMO: ${input}' },
        ]);
        const file = '/tmp/journal-unit/entry.md';
        const editor = new FakeEditor(new Map([[file, '# Title\n\n## Tasks\n\n## Notes\n']]));
        const inject = new Inject(config, silent as any, editor);

        const task = new Input(0);
        task.flags = 'task';
        task.text = 'write tests';
        await inject.injectInput(file, task);

        const memo = new Input(0);
        memo.flags = 'memo';
        memo.text = 'remember';
        await inject.injectInput(file, memo);

        assert.strictEqual(editor.texts.get(file), '# Title\n\n- MEMO: remember\n\n## Tasks\n\n- [ ] write tests\n\n## Notes\n');
    });
});
