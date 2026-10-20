import * as assert from 'assert';
import * as path from 'path';
import { Parser } from '../../features/smart-input/parser';
import { Configuration } from '../../shared/config/configuration';
import { NoteInput } from '../../shared/model/index';
import { FakeWorkspaceConfig } from '../fake-workspace-config';
import { TestLogger } from '../test-logger';

const DAY = new Date(2026, 4, 18);
const BASE = '/mnt/c/Users/me/Git/journal';

/**
 * A Windows base path (C:\...) in a WSL remote session, where the extension
 * host runs on Linux (#228): every resolved path must be a POSIX path below
 * /mnt/c, never "/C:\Users\...\journal/2026/05/...".
 */
(process.platform === 'win32' ? suite.skip : suite)('#228 — Windows base path on a non-Windows host (WSL remote)', () => {

    const variants = ['C:\\Users\\me\\Git\\journal', '/C:\\Users\\me\\Git\\journal', 'C:/Users/me/Git/journal', 'c:\\Users\\me\\Git\\journal\\'];

    for (const base of variants) {
        suite(`journal.base = ${JSON.stringify(base)}`, () => {
            const config = () => {
                const c = new Configuration(new FakeWorkspaceConfig({ base, scopes: [{ name: 'work', base: 'D:\\Work\\notes' }], patterns: { weeks: { path: '${base}/${year}', file: 'week_${week}.${ext}' } } }));
                c.setScopeFolders(['vera']);
                return c;
            };

            test('base path', () => {
                assert.strictEqual(config().getBasePath(), BASE);
            });

            test('daily entry', async () => {
                const c = config();
                const [dir, file] = await Promise.all([c.getResolvedEntryPath(DAY), c.getEntryFilePattern(DAY)]);
                assert.strictEqual(path.join(dir.value!, file.value!), `${BASE}/2026/05/18.md`);
            });

            test('weekly entry', async () => {
                const c = config();
                const [dir, file] = await Promise.all([c.getWeekPathPattern(21, 2026), c.getWeekFilePattern(21, 2026)]);
                assert.strictEqual(path.join(dir.value!, file.value!), `${BASE}/2026/week_21.md`);
            });

            test('note', async () => {
                const c = config();
                const input = new NoteInput();
                input.text = 'Konzept';
                input.date = DAY;
                assert.strictEqual(await new Parser(c, new TestLogger(false)).resolveNotePathForInput(input), `${BASE}/2026/05/18/Konzept.md`);
            });

            test('scope root and folder scope note', async () => {
                const c = config();
                assert.strictEqual(c.getScopeRoot(), `${BASE}/scopes`);
                const input = new NoteInput();
                input.text = '#vera Konzept';
                input.date = DAY;
                assert.strictEqual(await new Parser(c, new TestLogger(false)).resolveNotePathForInput(input), `${BASE}/scopes/vera/Konzept.md`);
            });

            test('configured scope with a Windows base', async () => {
                const c = config();
                assert.strictEqual(c.getBasePath('work'), '/mnt/d/Work/notes');
                const input = new NoteInput();
                input.text = '#work Konzept';
                input.date = DAY;
                assert.strictEqual(await new Parser(c, new TestLogger(false)).resolveNotePathForInput(input), '/mnt/d/Work/notes/2026/05/18/Konzept.md');
            });
        });
    }
});
