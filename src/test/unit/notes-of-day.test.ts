import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import { JournalConfiguration, SettingsWithDefaults } from 'journal-core';

const BASE = path.resolve(os.tmpdir(), 'journal-notes-of-day');
const DAY = new Date(2026, 9, 9);
const SAME_DAY = new Date(2026, 9, 9, 17, 30);
const EARLIER = new Date(2026, 9, 2, 9, 0);

function config(settings: Record<string, unknown> = {}, folders: string[] = []): JournalConfiguration {
    const c = new JournalConfiguration(new SettingsWithDefaults({ base: BASE, ...settings }));
    c.setScopeFolders(folders);
    return c;
}

const notes = (file: string) => ({ notes: { path: '${base}/notes', file } });

/** Notes belong to a day by the date in their path, else by their creation date; never by modification time (#279). */
suite('Notes of a day (journal-core)', () => {

    test('default pattern: every file in the day folder, attachments included, whenever created', () => {
        const day = config().getNotesOfDay(DAY);
        assert.strictEqual(day.folder, path.join(BASE, '2026', '10', '09'));
        assert.ok(day.dated, 'the day folder names the day');
        for (const file of ['Konzept.md', 'diagram.png']) {
            assert.ok(day.includes(file, EARLIER), file);
        }
    });

    test('flat folder with the date in the file name: only the files of that day', () => {
        const day = config({ patterns: notes('${d:YYYY-MM-DD}_${input}.${ext}') }).getNotesOfDay(DAY);
        assert.strictEqual(day.folder, path.join(BASE, 'notes'));
        assert.ok(day.includes('2026-10-09_Konzept.md'), 'the day');
        assert.ok(!day.includes('2026-10-08_Konzept.md', SAME_DAY), 'the day before, even if created on the day');
        assert.ok(!day.includes('Konzept.md', SAME_DAY), 'no date');
    });

    test('no single day in the pattern: the notes created on that day', () => {
        const cases: [string, JournalConfiguration, Date, string?][] = [
            ['flat folder', config({ patterns: notes('${input}.${ext}') }), DAY],
            // the last day of a month differs from the next day, but not from the day before
            ['monthly folder', config({ patterns: { notes: { path: '${base}/${year}/${month}', file: '${input}.${ext}' } } }), new Date(2026, 9, 31)],
            ['folder scope', config({}, ['vera']), DAY, 'vera'],
        ];
        for (const [name, c, date, scope] of cases) {
            const day = c.getNotesOfDay(date, scope);
            const created = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 17, 30);
            assert.ok(!day.dated, `${name}: names no day`);
            assert.ok(day.includes('Konzept.md', created), `${name}: created on the day`);
            assert.ok(!day.includes('Konzept.md', EARLIER), `${name}: created earlier (and edited on the day)`);
            assert.ok(!day.includes('Konzept.md'), `${name}: unknown creation time`);
        }
    });
});
