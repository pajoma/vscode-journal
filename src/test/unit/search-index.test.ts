import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import { HostEnvironment, JournalConfiguration, SettingsWithDefaults } from 'journal-core';
import * as fs from 'fs';
import { buildsIndexOnStartup, SearchIndex } from '../../features/smart-input/search-index';
import { FileEntry, INDEX_ON_STARTUP, JournalPageType, RECENCY, SEARCH_DEFAULTS, SearchSettings } from '../../shared/model/index';
import { Configuration } from '../../shared/config/configuration';
import { FakeWorkspaceConfig } from '../fake-workspace-config';
import { getJournalDate } from '../../shared/paths';
import { InMemoryFileSystem } from '../in-memory-fs';

const BASE = path.resolve(os.tmpdir(), 'journal');
const HOST: HostEnvironment = { language: 'en', workspaceRoot: () => BASE };
const PATTERNS = {
    entries: { path: '${base}/${year}/${month}', file: '${year}-${month}-${day}.${ext}' },
    weeks: { path: '${base}/${year}', file: '${year}-w${week}.${ext}' },
};
const config = new JournalConfiguration(new SettingsWithDefaults({ base: BASE, locale: 'de', patterns: PATTERNS, scopes: [{ name: 'work' }] }), HOST);
const at = (...parts: string[]) => path.join(BASE, ...parts);
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();
/** A file as the scanner finds it, with its journal date. */
const scanned = (file: string, type: JournalPageType, createdAt: number, scope = 'default'): FileEntry =>
    ({ path: file, name: path.basename(file), type, scope, updateAt: 1, createdAt, accessedAt: 1, journalDate: getJournalDate(file, createdAt, scope, config).getTime() });

/** The smart search (#300). */
suite('Issue #300 — smart search', () => {

    suite('the journal date of a file', () => {
        test('a daily entry: the day in its path', () => {
            assert.strictEqual(getJournalDate(at('2026', '10', '2026-10-18.md'), 0, 'default', config).getTime(), day(2026, 10, 18));
        });

        test('a weekly entry: the first day of the week (journal.locale)', () => {
            assert.strictEqual(getJournalDate(at('2026', '2026-w42.md'), 0, 'default', config).getTime(), day(2026, 10, 12));
        });

        test('a note in the notes folder of a day: that day, not its creation date', () => {
            assert.strictEqual(getJournalDate(at('2025', '03', '07', 'Kickoff.md'), day(2026, 1, 1), 'default', config).getTime(), day(2025, 3, 7));
        });

        test('files from before the patterns were changed: the default patterns', () => {
            assert.strictEqual(getJournalDate(at('2019', '03', '14.md'), 0, 'default', config).getTime(), day(2019, 3, 14), 'daily entry ${day}.${ext}');
            assert.strictEqual(getJournalDate(at('2022', 'week_20.md'), 0, 'default', config).getTime(), day(2022, 5, 16), 'weekly entry week_${week}.${ext}');
        });

        test('any other date in the path below the base, e.g. copies of entries', () => {
            assert.strictEqual(getJournalDate(at('2019', '03', '14 (1).md'), 0, 'default', config).getTime(), day(2019, 3, 14));
            assert.strictEqual(getJournalDate(at('2019', '03', '14-PAT-DESKTOP.md'), 0, 'default', config).getTime(), day(2019, 3, 14));
            assert.strictEqual(getJournalDate(at('notes', '2024_05_07-1030_scribe.md'), 0, 'default', config).getTime(), day(2024, 5, 7));
        });

        test('only the month in the path: the creation date in that month, else the first day of the month', () => {
            const note = at('2025', '03', 'notes', 'Kickoff.md');
            assert.strictEqual(getJournalDate(note, day(2025, 3, 20), 'default', config).getTime(), day(2025, 3, 20));
            assert.strictEqual(getJournalDate(note, day(2026, 9, 23), 'default', config).getTime(), day(2025, 3, 1), 'copied later');
        });

                test('no real day: the month of the path', () => {
            assert.strictEqual(getJournalDate(at('2019', '02', '31.md'), day(2026, 9, 23), 'default', config).getTime(), day(2019, 2, 1));
        });

        test('no date in the path: the creation date', () => {
            const created = day(2026, 9, 23);
            assert.strictEqual(getJournalDate(at('projects', 'vera', 'PRD.md'), created, 'default', config).getTime(), created);
        });

                test('a note without a day in its path: its creation date', () => {
            const created = day(2026, 5, 4) + 3600_000;
            assert.strictEqual(getJournalDate(at('scopes', 'work', 'Plan.md'), created, 'work', config).getTime(), created);
        });
    });

    suite('the index', () => {
        const files: [string[], JournalPageType, string, string?][] = [
            [['2026', '10', '2026-10-18.md'], JournalPageType.entry, '# Sunday\n\n- [ ] call Anna about the Kickoff\n'],
            [['2026', '2026-w42.md'], JournalPageType.weekly, '# Week 42\n\nplanning with Müller\n'],
            [['2025', '03', '07', 'Kickoff_Meeting.md'], JournalPageType.note, '# Kickoff\n\nagenda\n'],
            [['scopes', 'work', 'Plan.md'], JournalPageType.note, '# Plan\n\nkickoff for #work\n', 'work'],
            [['2026', '10', 'diagram.png'], JournalPageType.attachment, 'kickoff'],
        ];

        async function index(settings: Partial<SearchSettings> = {}): Promise<{ index: SearchIndex; fs: InMemoryFileSystem; entries: FileEntry[] }> {
            const fs = new InMemoryFileSystem();
            const entries: FileEntry[] = [];
            for (const [parts, type, text, scope] of files) {
                await fs.writeFile(at(...parts), new TextEncoder().encode(text));
                entries.push(scanned(at(...parts), type, day(2024, 1, 1), scope));
            }
            const idx = new SearchIndex(config, fs, () => ({ ...SEARCH_DEFAULTS, ...settings }));
            idx.setFiles(entries);
            await idx.readChanged();
            return { index: idx, fs, entries };
        }

        test('an empty query lists the journal files newest first, without attachments', async () => {
            const { index: idx } = await index();
            assert.deepStrictEqual(idx.search('').map(hit => hit.title), ['2026-10-18', '2026-w42', 'Kickoff Meeting', 'Plan']);
        });

        test('finds words in titles and text, every word must match', async () => {
            const { index: idx } = await index();
            assert.deepStrictEqual(idx.search('KICKOFF').map(hit => hit.title).sort(), ['2026-10-18', 'Kickoff Meeting', 'Plan']);
            assert.deepStrictEqual(idx.search('kickoff anna').map(hit => hit.title), ['2026-10-18']);
        });

        test('a hit in the title ranks above hits in the text', async () => {
            const { index: idx } = await index();
            assert.strictEqual(idx.search('kickoff')[0].title, 'Kickoff Meeting');
        });

        test('typos, word beginnings, plurals and accents', async () => {
            const { index: idx } = await index();
            assert.deepStrictEqual(idx.search('agnda').map(hit => hit.title), ['Kickoff Meeting'], 'one typo in a word of five letters');
            assert.deepStrictEqual(idx.search('agnd').map(hit => hit.title), [], 'no typos in shorter words');
            assert.ok(idx.search('plannin').map(hit => hit.title).includes('2026-w42'), 'beginning of "planning"');
            assert.deepStrictEqual(idx.search('meeting').map(hit => hit.title), ['Kickoff Meeting']);
            assert.deepStrictEqual(idx.search('Muller').map(hit => hit.title), ['2026-w42'], 'Müller without umlaut');
        });

        test('a text hit names its first matching line', async () => {
            const { index: idx } = await index();
            const [hit] = idx.search('anna');
            assert.deepStrictEqual([hit.line, hit.text], [2, '- [ ] call Anna about the Kickoff']);
        });

        test('a hit in the title has no line', async () => {
            const { index: idx } = await index();
            const hit = idx.search('meeting')[0];
            assert.deepStrictEqual([hit.title, hit.line], ['Kickoff Meeting', undefined]);
        });

        test('#scope filters by scope; a tag that is no scope is searched as text', async () => {
            const { index: idx } = await index();
            assert.deepStrictEqual(idx.search('#work').map(hit => hit.title), ['Plan']);
            assert.deepStrictEqual(idx.search('#work kickoff').map(hit => hit.title), ['Plan']);
            assert.deepStrictEqual(idx.search('#sunday').map(hit => hit.title), ['2026-10-18'], 'a tag that is no scope is searched as a word');
        });

        test('reads a file again only when it changed', async () => {
            const { index: idx, fs, entries } = await index();
            const entry = entries[0];
            await fs.writeFile(entry.path, new TextEncoder().encode('new text'));
            idx.setFiles(entries);
            await idx.readChanged();
            assert.strictEqual(idx.search('new').length, 0, 'same modification time: not read again');
            idx.setFiles(entries.map(fe => fe === entry ? { ...fe, updateAt: 2 } : fe));
            await idx.readChanged();
            assert.deepStrictEqual(idx.search('new').map(hit => hit.title), ['2026-10-18']);
        });

        test('found by name before the text is read', async () => {
            const fs = new InMemoryFileSystem();
            const idx = new SearchIndex(config, fs);
            idx.setFiles([scanned(at('2025', '03', '07', 'Kickoff_Meeting.md'), JournalPageType.note, 0)]);
            assert.deepStrictEqual(idx.search('kickoff').map(hit => hit.title), ['Kickoff Meeting']);
        });

        test('the limit', async () => {
            const { index: idx } = await index();
            assert.strictEqual(idx.search('', 2).length, 2);
        });
        test('journal.search.content off: titles only, text read before is dropped', async () => {
            let content = true;
            const fs = new InMemoryFileSystem();
            const file = at('2026', '10', '2026-10-18.md');
            await fs.writeFile(file, new TextEncoder().encode('call Anna'));
            const idx = new SearchIndex(config, fs, () => ({ ...SEARCH_DEFAULTS, content }));
            idx.setFiles([scanned(file, JournalPageType.entry, 0)]);
            await idx.readChanged();
            assert.strictEqual(idx.search('anna').length, 1);
            content = false;
            await idx.readChanged();
            assert.strictEqual(idx.search('anna').length, 0);
            assert.strictEqual(idx.search('2026').length, 1, 'still found by title');
        });

        test('journal.search.recency: off ranks by relevance only, high prefers recent files', async () => {
            const fs = new InMemoryFileSystem();
            const old = at('2015', '01', '2015-01-05.md');
            const recent = at('2026', '10', '2026-10-18.md');
            await fs.writeFile(old, new TextEncoder().encode('budget budget budget budget'));
            await fs.writeFile(recent, new TextEncoder().encode('budget and many other words in a much longer text about other topics entirely'));
            const files = [old, recent].map(p => scanned(p, JournalPageType.entry, 0));
            const first = async (recency: SearchSettings['recency']) => {
                const idx = new SearchIndex(config, fs, () => ({ ...SEARCH_DEFAULTS, recency }));
                idx.setFiles(files);
                await idx.readChanged();
                return idx.search('budget')[0].title;
            };
            assert.strictEqual(await first('off'), '2015-01-05', 'the better match');
            assert.strictEqual(await first('high'), '2026-10-18', 'the recent file');
        });

        test('journal.search.maxResults', async () => {
            const { index: idx } = await index({ maxResults: 1 });
            assert.strictEqual(idx.search('').length, 1);
        });
    });
});

suite('journal.search settings', () => {
    const read = (settings: Record<string, unknown>) => new Configuration(new FakeWorkspaceConfig(settings)).getSearchSettings();

    test('defaults', () => {
        assert.deepStrictEqual(read({}), SEARCH_DEFAULTS);
    });

    test('set values', () => {
        assert.deepStrictEqual(
            read({ 'search.enabled': false, 'search.indexOnStartup': 'always', 'search.content': false, 'search.recency': 'high', 'search.maxResults': 20 }),
            { enabled: false, indexOnStartup: 'always', content: false, recency: 'high', maxResults: 20 });
    });

    test('invalid values fall back to the defaults', () => {
        assert.deepStrictEqual(
            read({ 'search.enabled': 'no', 'search.indexOnStartup': 'sometimes', 'search.recency': 2, 'search.maxResults': 0 }),
            SEARCH_DEFAULTS);
    });

    test('the values are the ones package.json offers', () => {
        const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../..', 'package.json'), 'utf8'));
        const properties = [pkg.contributes.configuration].flat().reduce((all, section) => ({ ...all, ...section.properties }), {});
        assert.deepStrictEqual(properties['journal.search.indexOnStartup'].enum, [...INDEX_ON_STARTUP]);
        assert.deepStrictEqual(properties['journal.search.recency'].enum, [...RECENCY]);
    });

    test('the index is built after startup unless off, never, or local in a remote session', () => {
        const builds = (settings: Partial<SearchSettings>, remote: boolean) => buildsIndexOnStartup({ ...SEARCH_DEFAULTS, ...settings }, remote);
        assert.strictEqual(builds({}, false), true, 'local, on this machine');
        assert.strictEqual(builds({}, true), false, 'local, in a remote session');
        assert.strictEqual(builds({ indexOnStartup: 'always' }, true), true, 'always, in a remote session');
        assert.strictEqual(builds({ indexOnStartup: 'never' }, false), false, 'never');
        assert.strictEqual(builds({ enabled: false, indexOnStartup: 'always' }, false), false, 'search off');
    });
});
