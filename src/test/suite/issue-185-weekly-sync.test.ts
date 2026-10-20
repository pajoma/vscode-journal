import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import moment = require('moment');
import { Container } from '../../app/index';
import { Configuration } from '../../shared/config/configuration';
import { SyncDailyLinks } from '../../features/weekly/sync-daily-links';
import { getWeekFromPath } from '../../shared/paths';
import { daysOfWeek } from 'journal-core';
import { TestLogger } from '../test-logger';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

function buildCtrl(settings: Record<string, unknown>): { ctrl: Container; logger: TestLogger } {
    const logger = new TestLogger(false);
    const ctrl = new Container(new FakeWorkspaceConfig(settings), () => logger);
    return { ctrl, logger };
}

async function writeFile(uri: vscode.Uri, content = ''): Promise<void> {
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
}

async function readFile(uri: vscode.Uri): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
}

suite('Issue #185 — Weekly daily-link sync', () => {

    suite('daysOfWeek', () => {
        test('returns the 7 dates of the given week, starting with the first day of the week in the locale', () => {
            for (const [locale, firstDay] of [['en', 'Sunday'], ['de', 'Monday']]) {
                const dates = daysOfWeek(20, 2026, locale);
                assert.strictEqual(dates.length, 7, `${locale}: expected 7 dates`);

                const first = moment(dates[0]).locale(locale);
                assert.strictEqual(moment(dates[0]).locale('en').format('dddd'), firstDay, `${locale}: first day`);
                assert.strictEqual(first.week(), 20, `${locale}: expected week 20, got ${first.week()}`);
                assert.strictEqual(first.weekYear(), 2026, `${locale}: expected weekYear 2026, got ${first.weekYear()}`);

                // Days are consecutive.
                for (let i = 1; i < 7; i++) {
                    const diff = moment(dates[i]).diff(moment(dates[i - 1]), 'days');
                    assert.strictEqual(diff, 1, `${locale}: days[${i}] should be 1 day after days[${i - 1}]`);
                }
            }
        });
    });

    suite('daysOfWeek does not depend on today (#137)', () => {
        const originalNow = moment.now;
        teardown(() => { moment.now = originalNow; });

        // the week asked for, and its expected first day
        const expected: [number, number, string, string][] = [
            [53, 2026, 'de', '2026-12-28'], [1, 2027, 'de', '2027-01-04'],
            [1, 2027, 'en', '2026-12-27'], [52, 2026, 'en', '2026-12-20'], [20, 2026, 'de', '2026-05-11'],
        ];
        // today in a year with 52 weeks (2027), in week 53 of 2026 and in an ordinary week
        for (const today of ['2027-01-05', '2026-12-30', '2026-10-13']) {
            test(`today is ${today}`, () => {
                const now = moment(today, 'YYYY-MM-DD').valueOf();
                moment.now = () => now;
                for (const [week, year, locale, firstDay] of expected) {
                    const first = moment(daysOfWeek(week, year, locale)[0]).format('YYYY-MM-DD');
                    assert.strictEqual(first, firstDay, `week ${week}/${year} (${locale})`);
                }
            });
        }
    });

    suite('path helper — getWeekFromPath', () => {
        let tmpBase: string;
        let ctrl: Container;

        setup(async () => {
            tmpBase = path.join(os.tmpdir(), `issue185-uri-${Date.now()}`);
            ({ ctrl } = buildCtrl({ base: tmpBase }));
        });

        test('recognizes default weekly path and extracts week + year', async () => {
            // Default weeks.file = "week_${week}.${ext}", path = "${base}/${year}"
            // → e.g. <base>/2026/week_20.md
            const weeklyPath = path.join(tmpBase, '2026', 'week_20.md');
            const uri = vscode.Uri.file(weeklyPath);
            const result = await getWeekFromPath(uri.fsPath, ctrl.config);
            assert.ok(result, 'expected a match');
            assert.strictEqual(result!.week, 20);
            assert.strictEqual(result!.year, 2026);
            assert.strictEqual(result!.scope, 'default');
        });

        test('returns undefined for a daily entry URI', async () => {
            const dailyPath = path.join(tmpBase, '2026', '05', '14.md');
            const uri = vscode.Uri.file(dailyPath);
            const result = await getWeekFromPath(uri.fsPath, ctrl.config);
            assert.strictEqual(result, undefined);
        });

        test('returns undefined for a completely unrelated file', async () => {
            const uri = vscode.Uri.file('/tmp/some-other-file.md');
            const result = await getWeekFromPath(uri.fsPath, ctrl.config);
            assert.strictEqual(result, undefined);
        });
    });

    suite('Configuration.getWeeklySyncConfig', () => {
        test('returns defaults when setting is unset', async () => {
            const conf = new Configuration(new FakeWorkspaceConfig({}));
            const syncCfg = conf.getWeeklySyncConfig();
            assert.strictEqual(syncCfg.enabled, true);
            assert.strictEqual(syncCfg.anchor, '## Daily Entries');
            assert.strictEqual(syncCfg.template, '- [[${d:YYYY-MM-DD}|${weekday}, ${d:MMMM DD}]]', 'a wiki link (#311)');
            assert.strictEqual(syncCfg.sortOrder, 'ascending');
        });
    });

    suite('SyncDailyLinks — rendering (unit)', () => {
        let tmpBase: string;
        let ctrl: Container;
        let weeklyUri: vscode.Uri;

        setup(async () => {
            tmpBase = path.join(os.tmpdir(), `issue185-render-${Date.now()}`);
            ({ ctrl } = buildCtrl({ base: tmpBase }));

            // Create the weekly file placeholder (content irrelevant for rendering unit test).
            weeklyUri = vscode.Uri.file(path.join(tmpBase, '2026', 'week_20.md'));
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(tmpBase, '2026')));
            await writeFile(weeklyUri, '# Week 20\n\n## Daily Entries\n\n');
        });

        test('renderBlock produces one line per URI in ascending order', async () => {
            // Seed Mon (2026-05-11) and Wed (2026-05-13) of week 20.
            const monUri = vscode.Uri.file(path.join(tmpBase, '2026', '05', '11.md'));
            const wedUri = vscode.Uri.file(path.join(tmpBase, '2026', '05', '13.md'));
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(tmpBase, '2026', '05')));
            await writeFile(monUri, '');
            await writeFile(wedUri, '');

            const syncer = new SyncDailyLinks(ctrl);
            const block = await syncer.renderBlock(weeklyUri.fsPath, [monUri.fsPath, wedUri.fsPath]);

            const lines = block.split('\n').filter(l => l.length > 0);
            assert.deepStrictEqual(lines, ['- [[2026-05-11|Monday, May 11]]', '- [[2026-05-13|Wednesday, May 13]]'], 'one wiki link per entry, ascending');
        });

        test('renderBlock respects sortOrder=descending', async () => {
            const monUri = vscode.Uri.file(path.join(tmpBase, '2026', '05', '11.md'));
            const friUri = vscode.Uri.file(path.join(tmpBase, '2026', '05', '15.md'));
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(tmpBase, '2026', '05')));
            await writeFile(monUri, '');
            await writeFile(friUri, '');

            // Override weeklySync to descending.
            const { ctrl: descCtrl } = buildCtrl({ base: tmpBase, weeklySync: { enabled: true, anchor: '## Daily Entries', sortOrder: 'descending' },
                templates: [{ name: 'dailyLink', template: '- [${weekday}, ${d:MMMM DD}](${link})', after: '## Daily Entries' }] });

            const syncer = new SyncDailyLinks(descCtrl);
            const block = await syncer.renderBlock(weeklyUri.fsPath, [monUri.fsPath, friUri.fsPath]);
            const lines = block.split('\n').filter(l => l.length > 0);
            // Descending → Friday first (this template links by ${link}: markdown links)
            assert.ok(lines[0].includes('05/15.md'), `first line should be Friday: ${lines[0]}`);
            assert.ok(lines[1].includes('05/11.md'), `second line should be Monday: ${lines[1]}`);
        });
    });

    suite('SyncDailyLinks — integration', () => {
        let tmpBase: string;
        let ctrl: Container;
        let logger: TestLogger;
        let weeklyUri: vscode.Uri;
        const weeklyContent = '# Week 20\n\n## Daily Entries\n\n## Notes\n\n';

        setup(async () => {
            tmpBase = path.join(os.tmpdir(), `issue185-integ-${Date.now()}`);
            ({ ctrl, logger } = buildCtrl({ base: tmpBase }));

            await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(tmpBase, '2026')));
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(tmpBase, '2026', '05')));

            weeklyUri = vscode.Uri.file(path.join(tmpBase, '2026', 'week_20.md'));
            await writeFile(weeklyUri, weeklyContent);
        });

        test('W8 — golden path: sync injects links for existing daily entries', async () => {
            // Seed Mon + Wed + Fri of week 20, 2026.
            const monUri = vscode.Uri.file(path.join(tmpBase, '2026', '05', '11.md'));
            const wedUri = vscode.Uri.file(path.join(tmpBase, '2026', '05', '13.md'));
            const friUri = vscode.Uri.file(path.join(tmpBase, '2026', '05', '15.md'));
            await writeFile(monUri, '');
            await writeFile(wedUri, '');
            await writeFile(friUri, '');

            const syncer = new SyncDailyLinks(ctrl);
            await syncer.sync(weeklyUri.fsPath, 20, 2026);

            const result = await readFile(weeklyUri);
            // the default template is a wiki link (#311): the working days, with or without entry
            for (const day of ['2026-05-11|Monday', '2026-05-12|Tuesday', '2026-05-13|Wednesday', '2026-05-14|Thursday', '2026-05-15|Friday']) {
                assert.ok(result.includes(`- [[${day}`), `${day} expected: ${result}`);
            }
            assert.ok(!result.includes('2026-05-10') && !result.includes('2026-05-16'), 'no weekend day without entry');
            assert.ok(result.includes('## Daily Entries'), 'anchor must still be present');
            assert.ok(result.includes('## Notes'), 'next heading must still be present');
            assert.strictEqual(logger.errors.length, 0, 'no errors expected');
        });

        test('W9 — idempotent: second sync with no FS changes produces no edit', async () => {
            const monUri = vscode.Uri.file(path.join(tmpBase, '2026', '05', '11.md'));
            await writeFile(monUri, '');

            const syncer = new SyncDailyLinks(ctrl);
            await syncer.sync(weeklyUri.fsPath, 20, 2026);

            const after1 = await readFile(weeklyUri);
            // Second sync on the (now modified) entry.
            const applied2 = await syncer.applyBlock(
                weeklyUri.fsPath,
                '## Daily Entries',
                await syncer.renderWeek(weeklyUri.fsPath, 20, 2026)
            );
            assert.strictEqual(applied2, false, 'second apply should be a no-op');
            const after2 = await readFile(weeklyUri);
            assert.strictEqual(after2, after1, 'content must not change on second sync');
        });

        test('W10 — missing anchor: the section is added first under the title (#311)', async () => {
            const noAnchorUri = vscode.Uri.file(path.join(tmpBase, '2026', 'week_21.md'));
            await writeFile(noAnchorUri, '# Week 21\n\n## Tasks\n\n## Notes\n\n');
            const monUri = vscode.Uri.file(path.join(tmpBase, '2026', '05', '18.md'));
            await writeFile(monUri, '');

            const syncer = new SyncDailyLinks(ctrl);
            const applied = await syncer.applyBlock(noAnchorUri.fsPath, '## Daily Entries', '- [Monday, May 18](05/18.md)');
            assert.strictEqual(applied, true, 'the section is added');
            assert.strictEqual(await readFile(noAnchorUri), '# Week 21\n\n## Daily Entries\n\n- [Monday, May 18](05/18.md)\n\n## Tasks\n\n## Notes\n\n');
            assert.strictEqual(logger.errors.length, 0, 'no errors on missing anchor');
        });

        test('W11 — enabled=false: sync respects setting', async () => {
            const { ctrl: disabledCtrl } = buildCtrl({ base: tmpBase, weeklySync: { enabled: false, anchor: '## Daily Entries', template: '- [${weekday}, ${d:MMMM DD}](${link})', sortOrder: 'ascending' } });

            const monUri = vscode.Uri.file(path.join(tmpBase, '2026', '05', '11.md'));
            await writeFile(monUri, '');

            const syncer = new SyncDailyLinks(disabledCtrl);
            await syncer.sync(weeklyUri.fsPath, 20, 2026);
            const result = await readFile(weeklyUri);
            assert.strictEqual(result, weeklyContent, 'file must be untouched when disabled');
        });

        test('a weekend day is linked only if it has an entry (#311)', async () => {
            await writeFile(vscode.Uri.file(path.join(tmpBase, '2026', '05', '16.md')), '');
            const block = await new SyncDailyLinks(ctrl).renderWeek(weeklyUri.fsPath, 20, 2026);
            assert.deepStrictEqual(block.split('\n').map(line => line.slice(4, 14)),
                ['2026-05-11', '2026-05-12', '2026-05-13', '2026-05-14', '2026-05-15', '2026-05-16'], 'Monday to Friday and Saturday with its entry');
        });

        test('a template with ${link} (markdown link) links only the days that have an entry', async () => {
            const { ctrl: markdown } = buildCtrl({ base: tmpBase, templates: [{ name: 'dailyLink', template: '- [${weekday}, ${d:MMMM DD}](${link})', after: '## Daily Entries' }] });
            await writeFile(vscode.Uri.file(path.join(tmpBase, '2026', '05', '13.md')), '');
            const block = await new SyncDailyLinks(markdown).renderWeek(weeklyUri.fsPath, 20, 2026);
            assert.strictEqual(block, '- [Wednesday, May 13](05/13.md)');
        });

        test('W5 — findDailyEntriesForWeek returns existing URIs only, ascending', async () => {
            // Seed only Mon and Fri; leave rest absent.
            const monUri = vscode.Uri.file(path.join(tmpBase, '2026', '05', '11.md'));
            const friUri = vscode.Uri.file(path.join(tmpBase, '2026', '05', '15.md'));
            await writeFile(monUri, '');
            await writeFile(friUri, '');

            const syncer = new SyncDailyLinks(ctrl);
            const found = await syncer.findDailyEntriesForWeek(20, 2026);
            assert.strictEqual(found.length, 2, 'expected exactly 2 existing daily files');
            // Ascending order means Mon before Fri.
            assert.ok(found[0].endsWith('11.md'), `first should be Mon: ${found[0]}`);
            assert.ok(found[1].endsWith('15.md'), `second should be Fri: ${found[1]}`);
        });

        test('a document with the same fsPath but another scheme (diff editor) is not the weekly entry (#276)', async () => {
            const monUri = vscode.Uri.file(path.join(tmpBase, '2026', '05', '11.md'));
            await writeFile(monUri, '');
            // stands in for the git: side of a diff editor, opened before the weekly entry itself
            const provider = vscode.workspace.registerTextDocumentContentProvider('journal-test-git', {
                provideTextDocumentContent: () => '# HEAD version\n\n## Daily Entries\n',
            });
            try {
                const head = await vscode.workspace.openTextDocument(vscode.Uri.from({ scheme: 'journal-test-git', path: weeklyUri.path }));
                assert.strictEqual(head.uri.fsPath, weeklyUri.fsPath, 'precondition: same fsPath');

                await new SyncDailyLinks(ctrl).sync(weeklyUri.fsPath, 20, 2026);

                const onDisk = await readFile(weeklyUri);
                // the block replaced in the file's own text: the rest of the entry is kept
                // the date line of the week (English weeks: Sunday to Saturday) directly under the title (#311)
                assert.ok(onDisk.startsWith('# Week 20\n05-10 .. 05-16\n\n## Daily Entries\n\n- ['), `unexpected start: ${onDisk}`);
                assert.ok(onDisk.endsWith('- [[2026-05-15|Friday, May 15]]\n\n## Notes\n\n'), `unexpected end: ${onDisk}`);
                assert.strictEqual(head.getText(), '# HEAD version\n\n## Daily Entries\n', 'the other document is untouched');
                assert.strictEqual(logger.errors.length, 0, 'no errors expected');
            } finally {
                provider.dispose();
            }
        });
    });

    suite('Default weekly template includes ## Daily Entries', () => {
        test('W16 — getWeeklyTemplate includes ## Daily Entries anchor', async () => {
            const conf = new Configuration(new FakeWorkspaceConfig({}));
            const tpl = await conf.getWeeklyTemplate(20, 2026);
            assert.ok(tpl.value, 'template value should be set');
            assert.ok(tpl.value!.includes('## Daily Entries'),
                `expected '## Daily Entries' in: ${tpl.value}`);
        });
    });

    suite('W17 — #168 regression assertions remain green', () => {
        test('existing weekly template test still passes', async () => {
            const conf = new Configuration(new FakeWorkspaceConfig({}));
            const tpl = await conf.getWeeklyTemplate(7, 2026);
            assert.ok(tpl.value, 'template value should be set');
            assert.ok(tpl.value!.includes('# Week 7'), `expected '# Week 7' in: ${tpl.value}`);
            assert.ok(tpl.value!.includes('## Tasks'), `expected '## Tasks' anchor in: ${tpl.value}`);
            assert.ok(tpl.value!.includes('## Notes'), `expected '## Notes' anchor in: ${tpl.value}`);
        });
    });
});
