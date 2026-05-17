import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import moment = require('moment');
import * as J from '../..';
import { TestLogger } from '../test-logger';
import { MatchInput } from '../../journal/match-input';

async function setBase(tmpBase: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('journal');
    await config.update('base', tmpBase, vscode.ConfigurationTarget.Workspace);
}

async function buildCtrl(): Promise<{ ctrl: J.Util.Ctrl; logger: TestLogger }> {
    const refreshed = vscode.workspace.getConfiguration('journal');
    const ctrl = new J.Util.Ctrl(refreshed);
    const logger = new TestLogger(false);
    ctrl.initServices(logger);
    return { ctrl, logger };
}

suite('Issue #168 — Entry granularity', () => {

    suite('Configuration.getEntryGranularity', () => {
        let originalGranularity: string | undefined;

        setup(async () => {
            const config = vscode.workspace.getConfiguration('journal');
            originalGranularity = config.get<string>('entryGranularity');
        });

        teardown(async () => {
            const config = vscode.workspace.getConfiguration('journal');
            await config.update('entryGranularity', originalGranularity, vscode.ConfigurationTarget.Workspace);
        });

        test('defaults to "daily" when setting is unset', async () => {
            const config = vscode.workspace.getConfiguration('journal');
            await config.update('entryGranularity', undefined, vscode.ConfigurationTarget.Workspace);
            const refreshed = vscode.workspace.getConfiguration('journal');
            const conf = new J.VSCode.Configuration(refreshed);
            assert.strictEqual(conf.getEntryGranularity(), 'daily');
        });

        test('returns "weekly" when setting is "weekly"', async () => {
            const config = vscode.workspace.getConfiguration('journal');
            await config.update('entryGranularity', 'weekly', vscode.ConfigurationTarget.Workspace);
            const refreshed = vscode.workspace.getConfiguration('journal');
            const conf = new J.VSCode.Configuration(refreshed);
            assert.strictEqual(conf.getEntryGranularity(), 'weekly');
        });

        test('returns "daily" for any unknown value (defensive)', async () => {
            const config = vscode.workspace.getConfiguration('journal');
            await config.update('entryGranularity', 'monthly', vscode.ConfigurationTarget.Workspace);
            const refreshed = vscode.workspace.getConfiguration('journal');
            const conf = new J.VSCode.Configuration(refreshed);
            assert.strictEqual(conf.getEntryGranularity(), 'daily');
        });
    });

    suite('MatchInput granularity behavior', () => {
        let logger: TestLogger;
        const locale = 'en';

        setup(() => {
            logger = new TestLogger(false);
        });

        test('granularity=daily: bare "memo: buy milk" → offset=0, week=-1, hasWeek()=false', async () => {
            const matcher = new MatchInput(logger, locale, 'daily');
            const parsed = await matcher.parseInput('memo: buy milk');
            assert.strictEqual(parsed.flags, 'memo');
            assert.strictEqual(parsed.offset, 0);
            assert.strictEqual(parsed.hasWeek(), false);
        });

        test('granularity=weekly: bare "memo: buy milk" → week=currentISOWeek, hasOffset()=false', async () => {
            const matcher = new MatchInput(logger, locale, 'weekly');
            const parsed = await matcher.parseInput('memo: buy milk');
            assert.strictEqual(parsed.flags, 'memo');
            assert.strictEqual(parsed.hasWeek(), true, 'expected hasWeek()=true under weekly granularity');
            assert.strictEqual(parsed.week, moment().week(),
                `expected week=${moment().week()}, got ${parsed.week}`);
            assert.strictEqual(parsed.hasOffset(), false,
                'expected hasOffset()=false so reader routes to weekly');
        });

        test('granularity=weekly: explicit "+0 task fix bug" still routes to today (explicit wins)', async () => {
            const matcher = new MatchInput(logger, locale, 'weekly');
            const parsed = await matcher.parseInput('+0 task fix bug');
            assert.strictEqual(parsed.flags, 'task');
            assert.strictEqual(parsed.offset, 0);
            assert.strictEqual(parsed.hasWeek(), false,
                'explicit +0 must not be coerced into a week');
        });

        test('granularity=weekly: explicit "w20 task plan release" still routes to week 20', async () => {
            const matcher = new MatchInput(logger, locale, 'weekly');
            const parsed = await matcher.parseInput('w20 task plan release');
            assert.strictEqual(parsed.flags, 'task');
            assert.strictEqual(parsed.hasWeek(), true);
            assert.strictEqual(parsed.week, 20);
        });

        test('granularity=daily: explicit "w20 task plan release" still routes to week 20 (regression)', async () => {
            const matcher = new MatchInput(logger, locale, 'daily');
            const parsed = await matcher.parseInput('w20 task plan release');
            assert.strictEqual(parsed.flags, 'task');
            assert.strictEqual(parsed.hasWeek(), true);
            assert.strictEqual(parsed.week, 20);
        });

        test('granularity=weekly: explicit "yesterday memo: shopping" still routes to yesterday', async () => {
            const matcher = new MatchInput(logger, locale, 'weekly');
            const parsed = await matcher.parseInput('yesterday memo: shopping');
            assert.strictEqual(parsed.flags, 'memo');
            assert.strictEqual(parsed.offset, -1);
            assert.strictEqual(parsed.hasWeek(), false);
        });
    });

    suite('Default weekly template includes section anchors', () => {
        test('getWeeklyTemplate renders ## Tasks and ## Notes sections', async () => {
            const config = vscode.workspace.getConfiguration('journal');
            const conf = new J.VSCode.Configuration(config);
            const tpl = await conf.getWeeklyTemplate(7);
            assert.ok(tpl.value, 'template value should be set');
            assert.ok(tpl.value!.includes('# Week 7'), `expected '# Week 7' in: ${tpl.value}`);
            assert.ok(tpl.value!.includes('## Tasks'), `expected '## Tasks' anchor in: ${tpl.value}`);
            assert.ok(tpl.value!.includes('## Notes'), `expected '## Notes' anchor in: ${tpl.value}`);
        });
    });

    suite('Configuration.getResolvedWeeklyNotesPath', () => {
        let originalBase: string | undefined;
        let tmpBase: string;

        setup(async () => {
            const config = vscode.workspace.getConfiguration('journal');
            originalBase = config.get<string>('base');
            tmpBase = path.join(os.tmpdir(), `issue168-${Date.now()}`);
            await setBase(tmpBase);
        });

        teardown(async () => {
            const config = vscode.workspace.getConfiguration('journal');
            await config.update('base', originalBase, vscode.ConfigurationTarget.Workspace);
        });

        test('resolves the default weekly notes path with year and week substituted', async () => {
            const refreshed = vscode.workspace.getConfiguration('journal');
            const conf = new J.VSCode.Configuration(refreshed);

            const resolved = await conf.getResolvedWeeklyNotesPath(20, 2026);
            assert.ok(resolved.value, 'resolved value should be set');
            assert.ok(resolved.value!.includes('2026'),
                `expected year '2026' in path: ${resolved.value}`);
            assert.ok(resolved.value!.includes('w20'),
                `expected 'w20' in path: ${resolved.value}`);
            assert.ok(resolved.value!.startsWith(tmpBase),
                `expected path under base ${tmpBase}, got ${resolved.value}`);
        });

        test('weekly notes file pattern substitutes input', async () => {
            const refreshed = vscode.workspace.getConfiguration('journal');
            const conf = new J.VSCode.Configuration(refreshed);

            const filePattern = await conf.getWeeklyNotesFilePattern(20, 2026, 'My_Note');
            assert.ok(filePattern.value, 'file pattern value should be set');
            assert.ok(filePattern.value!.startsWith('My_Note'),
                `expected filename to start with 'My_Note', got ${filePattern.value}`);
            assert.ok(filePattern.value!.endsWith('.md'),
                `expected '.md' extension, got ${filePattern.value}`);
        });
    });

    suite('Parser.resolveNotePathForInput honors granularity', () => {
        let originalBase: string | undefined;
        let originalGranularity: string | undefined;
        let tmpBase: string;
        let ctrl: J.Util.Ctrl;

        setup(async () => {
            const config = vscode.workspace.getConfiguration('journal');
            originalBase = config.get<string>('base');
            originalGranularity = config.get<string>('entryGranularity');
            tmpBase = path.join(os.tmpdir(), `issue168-notes-${Date.now()}`);
            await setBase(tmpBase);
        });

        teardown(async () => {
            const config = vscode.workspace.getConfiguration('journal');
            await config.update('base', originalBase, vscode.ConfigurationTarget.Workspace);
            await config.update('entryGranularity', originalGranularity, vscode.ConfigurationTarget.Workspace);
        });

        test('granularity=daily: notes path uses day-keyed pattern (regression)', async () => {
            const config = vscode.workspace.getConfiguration('journal');
            await config.update('entryGranularity', 'daily', vscode.ConfigurationTarget.Workspace);
            ({ ctrl } = await buildCtrl());

            const input = new J.Model.Input(0);
            input.text = 'My_Note';
            const resolvedPath = await ctrl.parser.resolveNotePathForInput(input);
            const today = new Date();
            const yy = String(today.getFullYear());
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            assert.ok(resolvedPath.includes(path.join(yy, mm, dd)),
                `expected day-keyed path ${yy}/${mm}/${dd}, got ${resolvedPath}`);
        });

        test('granularity=weekly: notes path uses week-keyed pattern', async () => {
            const config = vscode.workspace.getConfiguration('journal');
            await config.update('entryGranularity', 'weekly', vscode.ConfigurationTarget.Workspace);
            ({ ctrl } = await buildCtrl());

            const input = new J.Model.Input(0);
            input.text = 'My_Note';
            const resolvedPath = await ctrl.parser.resolveNotePathForInput(input);
            const today = new Date();
            const expectedWeek = `w${moment(today).week()}`;
            const expectedYear = String(moment(today).weekYear());
            assert.ok(resolvedPath.includes(expectedWeek),
                `expected week segment ${expectedWeek}, got ${resolvedPath}`);
            assert.ok(resolvedPath.includes(expectedYear),
                `expected year ${expectedYear}, got ${resolvedPath}`);
            assert.ok(resolvedPath.includes('My_Note'),
                `expected filename in path, got ${resolvedPath}`);
        });
    });
});
