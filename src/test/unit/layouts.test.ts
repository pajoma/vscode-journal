import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import { HostEnvironment, JournalConfiguration, Layout, SettingsWithDefaults } from 'journal-core';
import { changedLayouts, currentLayouts } from '../../features/layouts/layout-changes';
import { nearestEntry } from '../../features/navigation/entry-walk';
import { JFileType } from '../../shared/model/index';
import { getDateFromPath, getJournalDate, getWeekFromPath } from '../../shared/paths';
import { InMemoryFileSystem } from '../in-memory-fs';

const BASE = path.resolve(os.tmpdir(), 'journal-layouts');
const HOST: HostEnvironment = { language: 'en', workspaceRoot: () => BASE };
const DATE = new Date(2026, 9, 9);

/** The current patterns of these tests: yearly folders, the date in the file name. */
const CURRENT = { entries: { path: '${base}/${year}', file: '${year}-${month}-${day}.${ext}' } };
/** The layout before: a folder per month below "daily". */
const EARLIER = { until: '2026-10-01', patterns: { entries: { path: '${base}/daily/${year}/${month}', file: '${day}.${ext}' } } };

function config(settings: Record<string, unknown> = {}): JournalConfiguration {
    return new JournalConfiguration(new SettingsWithDefaults({ base: BASE, patterns: CURRENT, patternHistory: [EARLIER], ...settings }), HOST);
}

const at = (...parts: string[]) => path.join(BASE, ...parts);

/** An in-memory journal with the given files (paths below the base) and their folders. */
function journal(files: string[]): InMemoryFileSystem {
    const fs = new InMemoryFileSystem();
    const folders = new Map<string, Map<string, JFileType>>();
    const add = (folder: string, name: string, type: JFileType) => {
        if (!folders.has(folder)) { folders.set(folder, new Map()); }
        folders.get(folder)!.set(name, type);
    };
    for (const file of files) {
        const full = at(file);
        void fs.writeFile(full, new TextEncoder().encode('# entry\n'));
        add(path.dirname(full), path.basename(full), JFileType.File);
        for (let dir = path.dirname(full); dir !== path.dirname(dir) && dir.startsWith(path.dirname(BASE)); dir = path.dirname(dir)) {
            add(path.dirname(dir), path.basename(dir), JFileType.Directory);
        }
    }
    for (const [folder, entries] of folders) { fs.addDirectory(folder, [...entries]); }
    return fs;
}

/** Changing journal.patterns must not hide the files written before (#309). */
suite('Layouts: journal.patternHistory (#309)', () => {

    suite('journal-core', () => {

        test('the layouts: current first, then the history, then the defaults', () => {
            const layouts = config().getLayouts();
            assert.deepStrictEqual(layouts.map(l => l.patterns.entries), [
                CURRENT.entries,
                EARLIER.patterns.entries,
                { path: '${base}/${year}/${month}', file: '${day}.${ext}' },
            ]);
            assert.deepStrictEqual(layouts.map(l => l.current), [true, false, false]);
            assert.strictEqual(layouts[1].until, '2026-10-01');
            assert.strictEqual(layouts[1].patterns.weeks.path, '${base}/${year}', 'unset patterns of an earlier layout are the defaults');
        });

        test('without changed patterns there is one layout', () => {
            const c = new JournalConfiguration(new SettingsWithDefaults({ base: BASE }), HOST);
            assert.strictEqual(c.getLayouts().length, 1);
        });

        test('an earlier extension, with or without dot; unset is the current one', () => {
            const c = config({ ext: 'md', patternHistory: [{ ext: '.txt' }, { patterns: EARLIER.patterns }] });
            assert.deepStrictEqual(c.getLayouts().map(l => l.ext), ['md', 'txt', 'md', 'md']);
        });

        test('the entry and week paths of every layout, the current one first', () => {
            const c = config();
            assert.deepStrictEqual(c.getEntryPaths(DATE), [
                at('2026', '2026-10-09.md'),
                at('daily', '2026', '10', '09.md'),
                at('2026', '10', '09.md'),
            ]);
            const weeks = config({ patterns: { ...CURRENT, weeks: { path: '${base}/weeks', file: '${year}-w${week}.${ext}' } } }).getWeekPaths(41, 2026);
            assert.deepStrictEqual(weeks, [at('weeks', '2026-w41.md'), at('2026', 'week_41.md')]);
        });

        test('a scope has its own history, not journal.patternHistory', () => {
            const c = config({ scopes: [{ name: 'work', base: at('work'), patternHistory: [{ patterns: { entries: { path: '${base}/old', file: '${year}${month}${day}.${ext}' } } }] }, { name: 'home', base: at('home') }] });
            assert.deepStrictEqual(c.getEntryPaths(DATE, 'work'), [at('work', '2026', '10', '09.md'), at('work', 'old', '20261009.md')]);
            assert.deepStrictEqual(c.getEntryPaths(DATE, 'home'), [at('home', '2026', '10', '09.md')]);
        });

        test('the notes of a day in every layout', () => {
            const c = config({ patterns: { ...CURRENT, notes: { path: '${base}/notes', file: '${d:YYYY-MM-DD}_${input}.${ext}' } } });
            const folders = c.getNotesOfDayInLayouts(DATE).map(notes => notes.folder);
            assert.deepStrictEqual(folders, [at('notes'), at('2026', '10', '09')]);
        });
    });

    suite('noticing a changed layout', () => {

        test('a change of journal.patterns or journal.ext changes the default scope, not the scopes that keep their own', () => {
            const settings: Record<string, unknown> = { base: BASE, patterns: CURRENT, scopes: [{ name: 'work', base: at('work') }] };
            const c = new JournalConfiguration(new SettingsWithDefaults(settings), HOST);
            const before = currentLayouts(c);
            assert.deepStrictEqual(changedLayouts(before, currentLayouts(c)), [], 'nothing changed');
            settings.patterns = { entries: { path: '${base}/daily', file: '${year}${month}${day}.${ext}' } };
            assert.deepStrictEqual(changedLayouts(before, currentLayouts(c)), ['default']);
            settings.patterns = CURRENT;
            settings.ext = 'txt';
            assert.deepStrictEqual(changedLayouts(before, currentLayouts(c)), ['default', 'work'], 'the extension applies to every scope');
        });

        test('patterns of a scope; added scopes and the history do not count', () => {
            const settings: Record<string, unknown> = { base: BASE, scopes: [{ name: 'work' }] };
            const c = new JournalConfiguration(new SettingsWithDefaults(settings), HOST);
            const before = currentLayouts(c);
            settings.patternHistory = [EARLIER];
            settings.scopes = [{ name: 'work', patterns: { entries: { path: '${base}/work', file: '${day}.${ext}' } } }, { name: 'home' }];
            assert.deepStrictEqual(changedLayouts(before, currentLayouts(c)), ['work']);
        });
    });

    suite('dates and weeks of files', () => {

        test('an entry of an earlier layout has its date', async () => {
            const date = await getDateFromPath(at('daily', '2025', '03', '14.md'), config());
            assert.deepStrictEqual([date.getFullYear(), date.getMonth(), date.getDate()], [2025, 2, 14]);
        });

        test('the journal date of an earlier entry, not its creation date', () => {
            const created = new Date(2026, 9, 20).getTime();
            assert.deepStrictEqual(getJournalDate(at('daily', '2025', '03', '14.md'), created, 'default', config()), new Date(2025, 2, 14));
        });

        test('a weekly entry of an earlier layout is a weekly entry', () => {
            const c = config({ patternHistory: [{ patterns: { weeks: { path: '${base}/weeks', file: 'KW${week}-${year}.${ext}' } } }] });
            assert.deepStrictEqual(getWeekFromPath(at('weeks', 'KW12-2025.md'), c), { week: 12, year: 2025, scope: 'default' });
        });
    });

    suite('nearest entry in a layout (navigation)', () => {

        const layout = (c: JournalConfiguration, i: number): Layout => c.getLayouts()[i];

        test('previous and next, across months and years', async () => {
            const fs = journal(['daily/2025/12/30.md', 'daily/2026/01/05.md', 'daily/2026/01/20.md']);
            const earlier = layout(config(), 1);
            assert.deepStrictEqual(await nearestEntry(fs, earlier, BASE, new Date(2026, 0, 5), 'previous'), new Date(2025, 11, 30));
            assert.deepStrictEqual(await nearestEntry(fs, earlier, BASE, new Date(2026, 0, 5), 'next'), new Date(2026, 0, 20));
            assert.deepStrictEqual(await nearestEntry(fs, earlier, BASE, new Date(2026, 0, 10), 'previous'), new Date(2026, 0, 5));
            assert.strictEqual(await nearestEntry(fs, earlier, BASE, new Date(2025, 11, 30), 'previous'), null, 'start of the journal');
        });

        test('the date in the file name, one folder per year', async () => {
            const fs = journal(['2026/2026-10-01.md', '2026/2026-10-09.md', '2026/notes.md', '2025/2025-12-31.md']);
            const current = layout(config(), 0);
            assert.deepStrictEqual(await nearestEntry(fs, current, BASE, DATE, 'previous'), new Date(2026, 9, 1));
            assert.deepStrictEqual(await nearestEntry(fs, current, BASE, new Date(2026, 9, 1), 'previous'), new Date(2025, 11, 31));
            assert.strictEqual(await nearestEntry(fs, current, BASE, DATE, 'next'), null);
        });

        test('folders that do not match the pattern are skipped', async () => {
            const fs = journal(['daily/2026/10/05.md', 'daily/2026/10/05/note.md', 'daily/scopes/2026/10/06.md', 'daily/2026/10/x.md']);
            assert.deepStrictEqual(await nearestEntry(fs, layout(config(), 1), BASE, DATE, 'previous'), new Date(2026, 9, 5));
        });
    });
});
