import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import { JournalConfiguration, SettingsWithDefaults } from 'journal-core';

const BASE = path.resolve(os.tmpdir(), 'journal-notes-of-day');

function config(settings: Record<string, unknown> = {}, folders: string[] = []): JournalConfiguration {
    const c = new JournalConfiguration(new SettingsWithDefaults({ base: BASE, ...settings }));
    c.setScopeFolders(folders);
    return c;
}

const notes = (file: string) => ({ notes: { path: '${base}/notes', file } });

/** Notes belong to a day by the date in their path, not by their modification time (#279). */
suite('Notes of a day (journal-core)', () => {

    test('default pattern: every file in the day folder, attachments included', () => {
        const day = config().getNotesOfDay(new Date(2026, 9, 9))!;
        assert.strictEqual(day.folder, path.join(BASE, '2026', '10', '09'));
        for (const file of ['Konzept.md', 'diagram.png']) {
            assert.ok(day.file.test(file), file);
        }
    });

    test('flat folder with the date in the file name: only the files of that day', () => {
        const day = config({ patterns: notes('${d:YYYY-MM-DD}_${input}.${ext}') }).getNotesOfDay(new Date(2026, 9, 9))!;
        assert.strictEqual(day.folder, path.join(BASE, 'notes'));
        assert.ok(day.file.test('2026-10-09_Konzept.md'), 'the day');
        assert.ok(!day.file.test('2026-10-08_Konzept.md'), 'the day before');
        assert.ok(!day.file.test('Konzept.md'), 'no date');
    });

    test('no single day in the pattern: no notes of a day (linked on creation only)', () => {
        const cases: [string, JournalConfiguration, Date][] = [
            ['flat folder', config({ patterns: notes('${input}.${ext}') }), new Date(2026, 9, 9)],
            // the last day of a month differs from the next day, but not from the day before
            ['monthly folder', config({ patterns: { notes: { path: '${base}/${year}/${month}', file: '${input}.${ext}' } } }), new Date(2026, 9, 31)],
        ];
        for (const [name, c, date] of cases) {
            assert.strictEqual(c.getNotesOfDay(date), undefined, name);
        }
        assert.strictEqual(config({}, ['vera']).getNotesOfDay(new Date(2026, 9, 9), 'vera'), undefined, 'folder scope');
    });
});
