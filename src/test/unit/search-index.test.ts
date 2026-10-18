import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import { HostEnvironment, JournalConfiguration, SettingsWithDefaults } from 'journal-core';
import { SearchIndex } from '../../features/smart-input/search-index';
import { FileEntry, JournalPageType } from '../../shared/model/index';
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

        test('a note without a day in its path: its creation date', () => {
            const created = day(2026, 5, 4) + 3600_000;
            assert.strictEqual(getJournalDate(at('scopes', 'work', 'Plan.md'), created, 'work', config).getTime(), created);
        });
    });

    suite('the index', () => {
        const files: [string[], JournalPageType, string, string?][] = [
            [['2026', '10', '2026-10-18.md'], JournalPageType.entry, '# Sunday\n\n- [ ] call Anna about the Kickoff\n'],
            [['2026', '2026-w42.md'], JournalPageType.weekly, '# Week 42\n\nplanning\n'],
            [['2025', '03', '07', 'Kickoff_Meeting.md'], JournalPageType.note, '# Kickoff\n\nagenda\n'],
            [['scopes', 'work', 'Plan.md'], JournalPageType.note, '# Plan\n\nkickoff for #work\n', 'work'],
            [['2026', '10', 'diagram.png'], JournalPageType.attachment, 'kickoff'],
        ];

        async function index(): Promise<{ index: SearchIndex; fs: InMemoryFileSystem; entries: FileEntry[] }> {
            const fs = new InMemoryFileSystem();
            const entries: FileEntry[] = [];
            for (const [parts, type, text, scope] of files) {
                await fs.writeFile(at(...parts), new TextEncoder().encode(text));
                entries.push({ path: at(...parts), name: parts[parts.length - 1], type, scope: scope ?? 'default', updateAt: 1, createdAt: day(2024, 1, 1), accessedAt: 1 });
            }
            const idx = new SearchIndex(config, fs);
            idx.setFiles(entries);
            await idx.readChanged();
            return { index: idx, fs, entries };
        }

        test('an empty query lists the journal files newest first, without attachments', async () => {
            const { index: idx } = await index();
            assert.deepStrictEqual(idx.search('').map(hit => hit.title), ['2026-10-18', '2026-w42', 'Kickoff Meeting', 'Plan']);
        });

        test('finds words in names and text, every word must match', async () => {
            const { index: idx } = await index();
            assert.deepStrictEqual(idx.search('KICKOFF').map(hit => hit.title), ['2026-10-18', 'Kickoff Meeting', 'Plan']);
            assert.deepStrictEqual(idx.search('kickoff anna').map(hit => hit.title), ['2026-10-18']);
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
            assert.deepStrictEqual(idx.search('#sunday').map(hit => hit.title), []);
            assert.deepStrictEqual(idx.search('#Week').map(hit => hit.title), [], 'no scope named "week", no text "#week"');
        });

        test('reads a file again only when it changed', async () => {
            const { index: idx, fs, entries } = await index();
            const entry = entries[0];
            await fs.writeFile(entry.path, new TextEncoder().encode('new text'));
            idx.setFiles(entries);
            await idx.readChanged();
            assert.strictEqual(idx.search('new text').length, 0, 'same modification time: not read again');
            idx.setFiles(entries.map(fe => fe === entry ? { ...fe, updateAt: 2 } : fe));
            await idx.readChanged();
            assert.deepStrictEqual(idx.search('new text').map(hit => hit.title), ['2026-10-18']);
        });

        test('found by name before the text is read', async () => {
            const fs = new InMemoryFileSystem();
            const idx = new SearchIndex(config, fs);
            idx.setFiles([{ path: at('2025', '03', '07', 'Kickoff_Meeting.md'), name: 'Kickoff_Meeting.md', type: JournalPageType.note, scope: 'default', updateAt: 1, createdAt: 0, accessedAt: 1 }]);
            assert.deepStrictEqual(idx.search('kickoff').map(hit => hit.title), ['Kickoff Meeting']);
        });

        test('the limit', async () => {
            const { index: idx } = await index();
            assert.strictEqual(idx.search('', 2).length, 2);
        });
    });
});
