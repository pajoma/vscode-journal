import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import moment = require('moment');
import * as J from '../..';
import { SyncDailyLinks } from '../../features/sync/sync-daily-links';
import { getWeekFromURIAndConfig } from '../../journal/paths';
import { getDatesOfISOWeek } from '../../util/dates';
import { TestLogger } from '../test-logger';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

function buildCtrl(settings: Record<string, unknown>): { ctrl: J.Util.Ctrl; logger: TestLogger } {
    const ctrl = new J.Util.Ctrl(new FakeWorkspaceConfig(settings));
    const logger = new TestLogger(false);
    ctrl.initServices(logger);
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

    suite('getDatesOfISOWeek', () => {
        test('returns 7 dates starting from Monday of the given week', () => {
            const dates = getDatesOfISOWeek(20, 2026);
            assert.strictEqual(dates.length, 7, 'expected 7 dates');

            const mon = moment(dates[0]);
            assert.strictEqual(mon.week(), 20, `expected week 20, got ${mon.week()}`);
            assert.strictEqual(mon.weekYear(), 2026, `expected weekYear 2026, got ${mon.weekYear()}`);

            // Days are consecutive.
            for (let i = 1; i < 7; i++) {
                const diff = moment(dates[i]).diff(moment(dates[i - 1]), 'days');
                assert.strictEqual(diff, 1, `days[${i}] should be 1 day after days[${i - 1}]`);
            }
        });
    });

    suite('URI helper — getWeekFromURIAndConfig', () => {
        let tmpBase: string;
        let ctrl: J.Util.Ctrl;

        setup(async () => {
            tmpBase = path.join(os.tmpdir(), `issue185-uri-${Date.now()}`);
            ({ ctrl } = buildCtrl({ base: tmpBase }));
        });

        test('recognizes default weekly path and extracts week + year', async () => {
            // Default weeks.file = "week_${week}.${ext}", path = "${base}/${year}"
            // → e.g. <base>/2026/week_20.md
            const weeklyPath = path.join(tmpBase, '2026', 'week_20.md');
            const uri = vscode.Uri.file(weeklyPath);
            const result = await getWeekFromURIAndConfig(uri, ctrl.config);
            assert.ok(result, 'expected a match');
            assert.strictEqual(result!.week, 20);
            assert.strictEqual(result!.year, 2026);
            assert.strictEqual(result!.scope, 'default');
        });

        test('returns undefined for a daily entry URI', async () => {
            const dailyPath = path.join(tmpBase, '2026', '05', '14.md');
            const uri = vscode.Uri.file(dailyPath);
            const result = await getWeekFromURIAndConfig(uri, ctrl.config);
            assert.strictEqual(result, undefined);
        });

        test('returns undefined for a completely unrelated file', async () => {
            const uri = vscode.Uri.file('/tmp/some-other-file.md');
            const result = await getWeekFromURIAndConfig(uri, ctrl.config);
            assert.strictEqual(result, undefined);
        });
    });

    suite('Configuration.getWeeklySyncConfig', () => {
        test('returns defaults when setting is unset', async () => {
            const conf = new J.VSCode.Configuration(new FakeWorkspaceConfig({}));
            const syncCfg = conf.getWeeklySyncConfig();
            assert.strictEqual(syncCfg.enabled, true);
            assert.strictEqual(syncCfg.anchor, '## Daily Entries');
            assert.strictEqual(syncCfg.template, '- [${weekday}, ${d:MMMM DD}](${link})');
            assert.strictEqual(syncCfg.sortOrder, 'ascending');
        });
    });

    suite('SyncDailyLinks — rendering (unit)', () => {
        let tmpBase: string;
        let ctrl: J.Util.Ctrl;
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

            const weeklyDoc = await vscode.workspace.openTextDocument(weeklyUri);
            const syncer = new SyncDailyLinks(ctrl);
            const block = await syncer.renderBlock(weeklyDoc, [monUri, wedUri]);

            const lines = block.split('\n').filter(l => l.length > 0);
            assert.strictEqual(lines.length, 2, 'expected 2 link lines');
            // Both lines should start with the link bullet.
            assert.ok(lines[0].startsWith('- ['), `line 0: ${lines[0]}`);
            assert.ok(lines[1].startsWith('- ['), `line 1: ${lines[1]}`);

            // Links should be relative paths.
            assert.ok(lines[0].includes('05/11.md'), `line 0 should link to 05/11.md: ${lines[0]}`);
            assert.ok(lines[1].includes('05/13.md'), `line 1 should link to 05/13.md: ${lines[1]}`);
        });

        test('renderBlock respects sortOrder=descending', async () => {
            const monUri = vscode.Uri.file(path.join(tmpBase, '2026', '05', '11.md'));
            const friUri = vscode.Uri.file(path.join(tmpBase, '2026', '05', '15.md'));
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(tmpBase, '2026', '05')));
            await writeFile(monUri, '');
            await writeFile(friUri, '');

            // Override weeklySync to descending.
            const { ctrl: descCtrl } = buildCtrl({ base: tmpBase, weeklySync: { enabled: true, anchor: '## Daily Entries', template: '- [${weekday}, ${d:MMMM DD}](${link})', sortOrder: 'descending' } });
            descCtrl.initServices(ctrl.logger);

            const weeklyDoc = await vscode.workspace.openTextDocument(weeklyUri);
            const syncer = new SyncDailyLinks(descCtrl);
            const block = await syncer.renderBlock(weeklyDoc, [monUri, friUri]);
            const lines = block.split('\n').filter(l => l.length > 0);
            // Descending → Friday first.
            assert.ok(lines[0].includes('05/15.md'), `first line should be Friday: ${lines[0]}`);
            assert.ok(lines[1].includes('05/11.md'), `second line should be Monday: ${lines[1]}`);
        });
    });

    suite('SyncDailyLinks — integration', () => {
        let tmpBase: string;
        let ctrl: J.Util.Ctrl;
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

            const weeklyDoc = await vscode.workspace.openTextDocument(weeklyUri);
            const syncer = new SyncDailyLinks(ctrl);
            await syncer.sync(weeklyDoc, 20, 2026);

            const result = await readFile(weeklyUri);
            assert.ok(result.includes('05/11.md'), `Mon link expected: ${result}`);
            assert.ok(result.includes('05/13.md'), `Wed link expected: ${result}`);
            assert.ok(result.includes('05/15.md'), `Fri link expected: ${result}`);
            assert.ok(result.includes('## Daily Entries'), 'anchor must still be present');
            assert.ok(result.includes('## Notes'), 'next heading must still be present');
            assert.strictEqual(logger.errors.length, 0, 'no errors expected');
        });

        test('W9 — idempotent: second sync with no FS changes produces no edit', async () => {
            const monUri = vscode.Uri.file(path.join(tmpBase, '2026', '05', '11.md'));
            await writeFile(monUri, '');

            const weeklyDoc = await vscode.workspace.openTextDocument(weeklyUri);
            const syncer = new SyncDailyLinks(ctrl);
            await syncer.sync(weeklyDoc, 20, 2026);

            const after1 = await readFile(weeklyUri);
            // Second sync on the (now modified) document.
            const doc2 = await vscode.workspace.openTextDocument(weeklyUri);
            const applied2 = await syncer.applyBlock(
                doc2,
                '## Daily Entries',
                await syncer.renderBlock(doc2, await syncer.findDailyEntriesForWeek(20, 2026))
            );
            assert.strictEqual(applied2, false, 'second apply should be a no-op');
            const after2 = await readFile(weeklyUri);
            assert.strictEqual(after2, after1, 'content must not change on second sync');
        });

        test('W10 — missing anchor: sync skips silently', async () => {
            const noAnchorUri = vscode.Uri.file(path.join(tmpBase, '2026', 'week_21.md'));
            await writeFile(noAnchorUri, '# Week 21\n\n## Tasks\n\n## Notes\n\n');
            const monUri = vscode.Uri.file(path.join(tmpBase, '2026', '05', '18.md'));
            await writeFile(monUri, '');

            const doc = await vscode.workspace.openTextDocument(noAnchorUri);
            const syncer = new SyncDailyLinks(ctrl);
            const applied = await syncer.applyBlock(doc, '## Daily Entries', '- [Monday, May 18](05/18.md)');
            assert.strictEqual(applied, false, 'should skip when anchor is missing');
            assert.strictEqual(logger.errors.length, 0, 'no errors on missing anchor');
        });

        test('W11 — enabled=false: sync respects setting', async () => {
            const { ctrl: disabledCtrl } = buildCtrl({ base: tmpBase, weeklySync: { enabled: false, anchor: '## Daily Entries', template: '- [${weekday}, ${d:MMMM DD}](${link})', sortOrder: 'ascending' } });
            disabledCtrl.initServices(logger);

            const monUri = vscode.Uri.file(path.join(tmpBase, '2026', '05', '11.md'));
            await writeFile(monUri, '');

            const doc = await vscode.workspace.openTextDocument(weeklyUri);
            const syncer = new SyncDailyLinks(disabledCtrl);
            await syncer.sync(doc, 20, 2026);
            const result = await readFile(weeklyUri);
            assert.strictEqual(result, weeklyContent, 'file must be untouched when disabled');
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
            assert.ok(found[0].fsPath.endsWith('11.md'), `first should be Mon: ${found[0].fsPath}`);
            assert.ok(found[1].fsPath.endsWith('15.md'), `second should be Fri: ${found[1].fsPath}`);
        });
    });

    suite('Default weekly template includes ## Daily Entries', () => {
        test('W16 — getWeeklyTemplate includes ## Daily Entries anchor', async () => {
            const conf = new J.VSCode.Configuration(new FakeWorkspaceConfig({}));
            const tpl = await conf.getWeeklyTemplate(20);
            assert.ok(tpl.value, 'template value should be set');
            assert.ok(tpl.value!.includes('## Daily Entries'),
                `expected '## Daily Entries' in: ${tpl.value}`);
        });
    });

    suite('W17 — #168 regression assertions remain green', () => {
        test('existing weekly template test still passes', async () => {
            const conf = new J.VSCode.Configuration(new FakeWorkspaceConfig({}));
            const tpl = await conf.getWeeklyTemplate(7);
            assert.ok(tpl.value, 'template value should be set');
            assert.ok(tpl.value!.includes('# Week 7'), `expected '# Week 7' in: ${tpl.value}`);
            assert.ok(tpl.value!.includes('## Tasks'), `expected '## Tasks' anchor in: ${tpl.value}`);
            assert.ok(tpl.value!.includes('## Notes'), `expected '## Notes' anchor in: ${tpl.value}`);
        });
    });
});
