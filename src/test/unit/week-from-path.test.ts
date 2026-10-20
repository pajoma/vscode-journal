import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import { HostEnvironment, JournalConfiguration, SettingsWithDefaults } from 'journal-core';
import { getWeekFromPath } from '../../shared/paths';

const BASE = path.resolve(os.tmpdir(), 'journal');
const HOST: HostEnvironment = { language: 'en', workspaceRoot: () => BASE };

function config(weeks: { path: string; file: string }, scopes: unknown[] = []): JournalConfiguration {
    return new JournalConfiguration(new SettingsWithDefaults({ base: BASE, patterns: { weeks }, scopes }), HOST);
}

/** Weekly entries are recognised by the weeks path pattern (#299). */
suite('getWeekFromPath', () => {

    test('the default pattern', () => {
        const c = config({ path: '${base}/${year}', file: 'week_${week}.${ext}' });
        assert.deepStrictEqual(getWeekFromPath(path.join(BASE, '2026', 'week_20.md'), c), { week: 20, year: 2026, scope: 'default' });
    });

    test('the year twice: week and year from the right places', () => {
        const c = config({ path: '${base}/${year}', file: '${year}-w${week}.${ext}' });
        assert.deepStrictEqual(getWeekFromPath(path.join(BASE, '2026', '2026-w42.md'), c), { week: 42, year: 2026, scope: 'default' });
    });

    test('the year twice must be the same year', () => {
        const c = config({ path: '${base}/${year}', file: '${year}-w${week}.${ext}' });
        assert.strictEqual(getWeekFromPath(path.join(BASE, '2025', '2026-w42.md'), c), undefined);
    });

    test('daily entries, notes and other folders are no weekly entries', () => {
        const c = config({ path: '${base}/${year}', file: '${year}-w${week}.${ext}' });
        for (const file of [
            path.join(BASE, '2026', '10', '2026-10-18.md'),
            path.join(BASE, '2026', '10', '18', 'Planning w42.md'),
            path.join(BASE, '2026', '2026-w42.txt'),
            path.join(os.tmpdir(), 'other', '2026', '2026-w42.md'),
        ]) {
            assert.strictEqual(getWeekFromPath(file, c), undefined, file);
        }
    });

    test('literal text in the pattern is not a regex', () => {
        const c = config({ path: '${base}/${year}', file: 'w.${week}.${ext}' });
        assert.strictEqual(getWeekFromPath(path.join(BASE, '2026', 'wx42.md'), c), undefined);
        assert.ok(getWeekFromPath(path.join(BASE, '2026', 'w.42.md'), c));
    });

    test('weekly entries in the default pattern, from before the pattern was changed (#309: the defaults are the oldest layout)', () => {
        const c = config({ path: '${base}/${year}', file: '${year}-w${week}.${ext}' });
        const old = path.join(BASE, '2022', 'week_20.md');
        assert.deepStrictEqual(getWeekFromPath(old, c), { week: 20, year: 2022, scope: 'default' });
    });

    test('a scope with its own base', () => {
        const work = path.resolve(os.tmpdir(), 'work');
        const c = config({ path: '${base}/${year}', file: 'week_${week}.${ext}' }, [{ name: 'work', base: work }]);
        assert.strictEqual(getWeekFromPath(path.join(work, '2026', 'week_3.md'), c)?.scope, 'work');
    });
});
