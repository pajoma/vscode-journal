import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HostEnvironment, JournalConfiguration, SettingsWithDefaults } from 'journal-core';
import { migrate, movedLink, planLinkChanges, planMigration } from '../../features/layouts/migration';
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

    test('a scope without own base or patterns does not keep the old daily entries in place', async () => {
        fs.mkdirSync(at('scopes/vera'), { recursive: true });
        config.setScopeFolders(['vera']);
        const configured = new JournalConfiguration(new SettingsWithDefaults({ base, patterns: PATTERNS, scopes: [{ name: 'work' }] }), { language: 'en', workspaceRoot: () => base });
        for (const c of [config, configured]) {
            const kinds = (await planMigration(new NodeFileSystem(), c)).moves.map(m => m.kind);
            assert.deepStrictEqual(kinds, ['entry', 'weekly', 'note']);
        }
    });

    test('a scope with its own base keeps its files', async () => {
        // the scope's own base is the journal base, and the scope keeps the default patterns there
        const own = new JournalConfiguration(new SettingsWithDefaults({ base, patterns: PATTERNS, scopes: [{ name: 'work', base }] }), { language: 'en', workspaceRoot: () => base });
        const moved = (await planMigration(new NodeFileSystem(), own)).moves.map(m => rel(m.from));
        assert.ok(!moved.includes('2026/10/09.md'), 'the scope\'s current entry stays');
        assert.ok(moved.includes('2026/week_41.md'), 'the scope does not set the weekly pattern of the default layout');
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

    test('the dry run writes nothing', async () => {
        const snapshot = () => {
            const files: Record<string, string> = {};
            const walk = (dir: string) => {
                for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                    const full = path.join(dir, entry.name);
                    if (entry.isDirectory()) { walk(full); } else { files[rel(full)] = fs.readFileSync(full, 'utf8'); }
                }
            };
            walk(base);
            return files;
        };
        const before = snapshot();
        const fsys = new NodeFileSystem();
        const plan = await planMigration(fsys, config);
        const links = await planLinkChanges(fsys, config, plan.moves);
        assert.ok(links.length > 0, 'there are link changes to show');
        assert.deepStrictEqual(snapshot(), before);
    });

    test('the dry run shows exactly the link changes the migration writes', async () => {
        const fsys = new NodeFileSystem();
        const { moves } = await planMigration(fsys, config);
        const preview = await planLinkChanges(fsys, config, moves);
        assert.deepStrictEqual(preview.map(c => [rel(c.file), rel(c.target), c.links]), [
            ['2026/10/09.md', '2026/2026-10-09.md', [
                { from: './09/Konzept.md', to: '../notes/2026/2026-10-09_Konzept.md' },
                { from: './09/diagram.png', to: '10/09/diagram.png' },
                { from: '../week_41.md#tasks', to: '../weeks/2026-w41.md#tasks' },
            ]],
            ['2026/10/09/Konzept.md', 'notes/2026/2026-10-09_Konzept.md', [{ from: '../09.md', to: '../../2026/2026-10-09.md' }]],
            ['2026/week_41.md', 'weeks/2026-w41.md', [{ from: '10/09.md', to: '../2026/2026-10-09.md' }]],
        ]);
        const result = await migrate(fsys, config, moves);
        assert.deepStrictEqual(result.linkChanges, preview);
    });

    test('a file that cannot be moved keeps its place, and the links do not point to its target', async () => {
        const fsys = new NodeFileSystem();
        const { moves } = await planMigration(fsys, config);
        const failing = Object.assign(new NodeFileSystem(), {
            rename: (from: string, to: string) => from.endsWith('week_41.md') ? Promise.reject(new Error('locked')) : fsys.rename(from, to),
        });
        const result = await migrate(failing, config, moves);
        assert.deepStrictEqual(result.failed.map(f => rel(f.move.from)), ['2026/week_41.md']);
        assert.ok(read('2026/2026-10-09.md').includes('[Week 41](week_41.md#tasks)'), 'the link points to the file that stayed, from the entry\'s new folder');
        assert.ok(fs.existsSync(at('2026/week_41.md')));
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
