import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HostEnvironment, JournalConfiguration, SettingsWithDefaults } from 'journal-core';
import { migrate, movedLink, planMigration } from '../../features/layouts/migration';
import { NodeFileSystem } from '../node-fs';

/** The current patterns; the journal was written with the default patterns before (the oldest layout). */
const PATTERNS = {
    entries: { path: '${base}/${year}', file: '${year}-${month}-${day}.${ext}' },
    weeks: { path: '${base}/weeks', file: '${year}-w${week}.${ext}' },
    notes: { path: '${base}/notes/${year}', file: '${d:YYYY-MM-DD}_${input}.${ext}' },
};

/** Journal: Migrate to Current Layout (#309). */
suite('Layout migration (#309)', () => {
    let base: string;
    let config: JournalConfiguration;
    const at = (file: string) => path.join(base, ...file.split('/'));
    const write = (file: string, text: string) => {
        fs.mkdirSync(path.dirname(at(file)), { recursive: true });
        fs.writeFileSync(at(file), text);
    };
    const read = (file: string) => fs.readFileSync(at(file), 'utf8');
    const rel = (file: string) => path.relative(base, file).split(path.sep).join('/');

    setup(() => {
        base = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-migration-'));
        const host: HostEnvironment = { language: 'en', workspaceRoot: () => base };
        config = new JournalConfiguration(new SettingsWithDefaults({ base, patterns: PATTERNS }), host);
        write('2026/10/09.md', [
            '# Friday', '',
            '- NOTE: [Konzept](./09/Konzept.md)',
            '- [(.png) diagram](./09/diagram.png)',
            '- [Week 41](../week_41.md#tasks) and [web](https://example.com/a.md)', '',
        ].join('\n'));
        write('2026/10/09/Konzept.md', '# Konzept\n\nfrom [the entry](../09.md)\n');
        write('2026/10/09/diagram.png', 'png');
        write('2026/week_41.md', '# Week 41\n\n- [Friday](10/09.md)\n');
        write('2026/10/12.md', '# Monday (old)\n');
        write('2026/2026-10-12.md', '# Monday (new)\n');
        write('2026/2026-10-13.md', '# Tuesday, already in the current layout\n');
    });

    teardown(() => fs.rmSync(base, { recursive: true, force: true }));

    test('the plan: entries, weekly entries and notes of the earlier layout and their targets', async () => {
        const plan = await planMigration(new NodeFileSystem(), config);
        assert.deepStrictEqual(plan.moves.map(m => [m.kind, rel(m.from), rel(m.to)]), [
            ['entry', '2026/10/09.md', '2026/2026-10-09.md'],
            ['weekly', '2026/week_41.md', 'weeks/2026-w41.md'],
            ['note', '2026/10/09/Konzept.md', 'notes/2026/2026-10-09_Konzept.md'],
        ]);
        assert.deepStrictEqual(plan.conflicts.map(c => [rel(c.from), rel(c.to), c.reason]), [['2026/10/12.md', '2026/2026-10-12.md', 'exists']]);
    });

    test('nothing to plan without earlier layouts', async () => {
        const plain = new JournalConfiguration(new SettingsWithDefaults({ base }), { language: 'en', workspaceRoot: () => base });
        assert.deepStrictEqual(await planMigration(new NodeFileSystem(), plain), { moves: [], conflicts: [] });
    });

    test('moving updates the links in the moved files and to them; conflicts stay', async () => {
        const fsys = new NodeFileSystem();
        const result = await migrate(fsys, config, (await planMigration(fsys, config)).moves);
        assert.strictEqual(result.moved.length, 3);
        assert.deepStrictEqual(result.failed, []);

        assert.strictEqual(read('2026/2026-10-09.md'), [
            '# Friday', '',
            '- NOTE: [Konzept](../notes/2026/2026-10-09_Konzept.md)',
            '- [(.png) diagram](10/09/diagram.png)',
            '- [Week 41](../weeks/2026-w41.md#tasks) and [web](https://example.com/a.md)', '',
        ].join('\n'));
        assert.strictEqual(read('notes/2026/2026-10-09_Konzept.md'), '# Konzept\n\nfrom [the entry](../../2026/2026-10-09.md)\n');
        assert.strictEqual(read('weeks/2026-w41.md'), '# Week 41\n\n- [Friday](../2026/2026-10-09.md)\n');
        assert.strictEqual(read('2026/10/12.md'), '# Monday (old)\n', 'the conflict is not touched');
        assert.strictEqual(read('2026/2026-10-12.md'), '# Monday (new)\n');
        assert.ok(fs.existsSync(at('2026/10/09/diagram.png')), 'attachments stay');
        assert.ok(!fs.existsSync(at('2026/10/09.md')));
    });

    test('only the chosen moves; folders left empty are removed', async () => {
        fs.rmSync(at('2026/10/12.md'));
        const fsys = new NodeFileSystem();
        const entries = (await planMigration(fsys, config)).moves.filter(m => m.kind !== 'note');
        fs.rmSync(at('2026/10/09'), { recursive: true });
        await migrate(fsys, config, entries);
        assert.ok(!fs.existsSync(at('2026/10')), 'the month folder was empty');
        assert.ok(fs.existsSync(at('2026')), 'the base and folders with files stay');
    });

    test('movedLink: anchors, absolute paths, web links and unmoved targets', () => {
        const from = path.join(base, '2026', '10');
        const to = path.join(base, '2026');
        const moved = new Map([[path.join(base, '2026', '10', '09', 'a.md'), path.join(base, 'notes', 'a.md')]]);
        assert.strictEqual(movedLink('09/a.md#x', from, from, moved), '../../notes/a.md#x');
        assert.strictEqual(movedLink('09/b.md', from, to, moved), '10/09/b.md', 'the linking file moved');
        assert.strictEqual(movedLink('09/b.md', from, from, moved), undefined, 'nothing moved');
        assert.strictEqual(movedLink(path.join(base, '2026', '10', '09', 'a.md'), from, from, moved), path.join(base, 'notes', 'a.md').split(path.sep).join('/'));
        for (const target of ['https://example.com', 'mailto:a@b.c', '#heading', '']) {
            assert.strictEqual(movedLink(target, from, to, moved), undefined, target);
        }
    });
});
