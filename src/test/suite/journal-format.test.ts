import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { matchInput } from '../../features/smart-input/match-input';
import { Parser } from '../../features/smart-input/parser';
import { CompletedTaskActions } from '../../features/tasks/codeactions/for-completed-tasks';
import { Configuration } from '../../shared/config/configuration';
import { Inject } from '../../features/entries/inject';
import { Reader } from '../../features/entries/reader';
import { VscodeFileSystem } from '../../shared/fs/vscode-fs';
import { SyncDailyLinks } from '../../features/weekly/sync-daily-links';
import { IWriter, JournalController, NoteInput, TextPosition, TextReplacement } from '../../shared/model/index';
import { LINE_KINDS, linkTargets, normalizeFilename, noteTitle, parseWikiTarget, resolveDate, SettingsWithDefaults } from 'journal-core';
import { TestLogger } from '../test-logger';
import { createMockCtrl } from './command-test-helpers';

interface Case { name: string; settings: Record<string, unknown>; expected: string; }

interface Fixtures {
    date: string;
    entries: Case[];
    weeks: (Case & { date: string; week: number })[];
    notes: (Case & { scope: string; title: string; folders?: string[] })[];
    filenames: [string, string][];
    templates: { template: string; locale: string; expected: string }[];
    weeklyTemplates: (Case & { date: string })[];
    reopenTasks: [string, string][];
    noteHeaders: { name: string; template: string; title: string; tags: string[]; locale: string; expected: string }[];
    fileLinks: { name: string; from: string; file: string; ext: string; expected: string }[];
    linkTargets: { name: string; line: string; expected: string[] }[];
    layouts: (Case & { existing: string[]; period?: 'daily' | 'weekly' })[];
    wikiTargets: { target: string; expected: unknown }[];
    noteTitles: { file: string; pattern: string; expected: string }[];
    placement: { name: string; kind: 'task' | 'memo' | 'link'; memoTemplate?: string; after: string; text: string; line: string; expected: string }[];
}

const ROOT = path.resolve(__dirname, '../../..');
const FIXTURES: Fixtures = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/test/fixtures/journal-format.json'), 'utf8'));
/** A fixture day (YYYY-MM-DD) as local date. */
function day(iso: string): Date {
    const [year, month, date] = iso.split('-').map(Number);
    return new Date(year, month - 1, date);
}
const DATE = day(FIXTURES.date);

function configuration(settings: Record<string, unknown>, folders: string[] = []): { config: Configuration; base: string } {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-format-'));
    // the package.json defaults, as VS Code returns them for unset settings (checked by settings-defaults.test.ts)
    const config = new Configuration(new SettingsWithDefaults({ ...settings, base }));
    config.setScopeFolders(folders);
    return { config, base };
}

const relative = (base: string, file: string) => path.relative(base, file).split(path.sep).join('/');

/** The fields this runner handles; a new field must be handled here and in mcp-server/test/contract.test.ts. */
const KNOWN_FIELDS: Record<string, string[]> = {
    fixtures: ['$comment', 'date', 'entries', 'weeks', 'notes', 'filenames', 'templates', 'weeklyTemplates', 'reopenTasks', 'noteHeaders', 'fileLinks', 'linkTargets', 'layouts', 'wikiTargets', 'noteTitles', 'placement'],
    entries: ['name', 'settings', 'expected'],
    weeks: ['name', 'settings', 'date', 'week', 'expected'],
    notes: ['name', 'settings', 'folders', 'scope', 'title', 'expected'],
    templates: ['template', 'locale', 'expected'],
    weeklyTemplates: ['name', 'settings', 'date', 'expected'],
    noteHeaders: ['name', 'template', 'title', 'tags', 'locale', 'expected'],
    fileLinks: ['name', 'from', 'file', 'ext', 'expected'],
    linkTargets: ['name', 'line', 'expected'],
    layouts: ['name', 'settings', 'period', 'existing', 'expected'],
    wikiTargets: ['target', 'expected'],
    noteTitles: ['file', 'pattern', 'expected'],
    placement: ['name', 'kind', 'memoTemplate', 'after', 'text', 'line', 'expected'],
};

/** The same cases run in the MCP server's contract test, so both write the same files (#250). */
suite('Journal format shared with the MCP server (#250)', () => {

    test('knows every field of the cases', () => {
        const unknown = (keys: string[], known: string[]) => keys.filter(k => !known.includes(k));
        assert.deepStrictEqual(unknown(Object.keys(FIXTURES), KNOWN_FIELDS.fixtures), [], 'top level');
        for (const section of ['entries', 'weeks', 'notes', 'templates', 'weeklyTemplates', 'noteHeaders', 'fileLinks', 'linkTargets', 'layouts', 'wikiTargets', 'noteTitles', 'placement'] as const) {
            for (const c of FIXTURES[section]) {
                assert.deepStrictEqual(unknown(Object.keys(c), KNOWN_FIELDS[section]), [], `${section}: ${JSON.stringify(c)}`);
            }
        }
    });

    for (const c of FIXTURES.entries) {
        test(`entry path: ${c.name}`, async () => {
            const { config, base } = configuration(c.settings);
            const [dir, file] = await Promise.all([config.getResolvedEntryPath(DATE), config.getEntryFilePattern(DATE)]);
            assert.strictEqual(relative(base, path.join(dir.value!, file.value!)), c.expected);
        });
    }

    for (const c of FIXTURES.layouts) {
        test(`layouts: ${c.name}`, async () => {
            const { config, base } = configuration(c.settings);
            for (const file of c.existing) {
                fs.mkdirSync(path.dirname(path.join(base, file)), { recursive: true });
                fs.writeFileSync(path.join(base, file), '# entry\n');
            }
            const created: string[] = [];
            const create = async (file: string) => { created.push(file); return file; };
            const writer = { createEntryForPath: create, createWeeklyForPath: create } as unknown as IWriter;
            const reader = new Reader(config, new TestLogger(false), writer, new VscodeFileSystem());
            const { week, weekYear } = matchInput('w', config.getLocale(), 'daily', DATE);
            const entry = c.period === 'weekly' ? await reader.loadEntryForWeek(week, weekYear) : await reader.loadEntryForDay(DATE);
            assert.strictEqual(relative(base, entry), c.expected);
            assert.strictEqual(created.length, c.existing.length === 0 ? 1 : 0, 'created only if no layout has the entry');
        });
    }

    test('wiki link targets and note titles (#92)', () => {
        for (const c of FIXTURES.wikiTargets) {
            assert.deepStrictEqual(parseWikiTarget(c.target), c.expected, c.target);
        }
        for (const c of FIXTURES.noteTitles) {
            assert.strictEqual(noteTitle(c.file, c.pattern), c.expected, c.file);
        }
    });

    for (const c of FIXTURES.weeks) {
        test(`week path: ${c.name}`, async () => {
            const { config, base } = configuration(c.settings);
            // the week and its year as smart input computes them for "w" on that day
            const { week, weekYear } = matchInput('w', config.getLocale(), 'daily', day(c.date));
            assert.strictEqual(week, c.week, 'week number');
            const [dir, file] = await Promise.all([config.getWeekPathPattern(week, weekYear), config.getWeekFilePattern(week, weekYear)]);
            assert.strictEqual(relative(base, path.join(dir.value!, file.value!)), c.expected);
        });
    }

    for (const c of FIXTURES.notes) {
        test(`note path: ${c.name}`, async () => {
            const { config, base } = configuration(c.settings, c.folders);
            const input = new NoteInput();
            input.text = `#${c.scope} ${c.title}`;
            input.date = DATE;
            const file = await new Parser(config, new TestLogger(false)).resolveNotePathForInput(input);
            assert.strictEqual(input.scope, c.scope, 'scope detected');
            assert.strictEqual(relative(base, file), c.expected);
        });
    }

    for (const c of FIXTURES.weeklyTemplates) {
        test(`weekly template: ${c.name}`, async () => {
            const { config } = configuration(c.settings);
            const { week, weekYear } = matchInput('w', config.getLocale(), 'daily', day(c.date));
            const tpl = await config.getWeeklyTemplate(week, weekYear);
            assert.strictEqual(tpl.value!.trimEnd(), c.expected);
        });
    }

    test('file names', () => {
        for (const [input, expected] of FIXTURES.filenames) {
            assert.strictEqual(normalizeFilename(input), expected, input);
        }
    });

    test('reopening a task', async () => {
        for (const [line, expected] of FIXTURES.reopenTasks) {
            const doc = await vscode.workspace.openTextDocument({ content: line + '\n', language: 'markdown' });
            const range = new vscode.Range(0, 0, 0, line.length);
            const context = { diagnostics: [], only: undefined, triggerKind: vscode.CodeActionTriggerKind.Invoke };
            const actions = await new CompletedTaskActions(createMockCtrl())
                .provideCodeActions(doc, range, context, new vscode.CancellationTokenSource().token) as vscode.CodeAction[];
            await vscode.workspace.applyEdit(actions[0].edit!);
            assert.strictEqual(doc.lineAt(0).text, expected, line);
        }
    });

    test('template variables', () => {
        for (const c of FIXTURES.templates) {
            assert.strictEqual(resolveDate(c.template, DATE, c.locale), c.expected, `${c.template} (${c.locale})`);
        }
    });

    for (const c of FIXTURES.noteHeaders) {
        test(`note header: ${c.name}`, async () => {
            const { config } = configuration({ locale: c.locale, templates: [{ name: 'note', template: c.template }] });
            const input = new NoteInput();
            input.text = c.title;
            input.tags = c.tags;
            input.date = DATE;
            const content = await new Inject(config, new TestLogger(false), createMockCtrl().editor).formatNote(input);
            assert.strictEqual(content.trimEnd(), c.expected);
        });
    }

    for (const c of FIXTURES.placement) {
        // where the extension adds memos, tasks and note links (#320)
        test(`placement: ${c.name}`, async () => {
            let text = c.text;
            const editor = {
                ...createMockCtrl().editor,
                getText: async () => text,
                replace: async (_path: string, edit: TextReplacement) => {
                    const offset = (p: TextPosition) => text.split('\n').slice(0, p.line).reduce((sum, l) => sum + l.length + 1, 0) + p.character;
                    text = text.slice(0, offset(edit.start)) + edit.value + text.slice(offset(edit.end));
                },
            };
            const { config } = configuration({});
            const kind = c.kind === 'memo' ? LINE_KINDS.memo(c.memoTemplate!) : LINE_KINDS[c.kind];
            await new Inject(config, new TestLogger(false), editor).place('entry.md', { template: '${line}', value: '${line}', after: c.after }, kind, [{ values: [['${line}', c.line]] }]);
            assert.strictEqual(text, c.expected);
        });
    }

    for (const c of FIXTURES.fileLinks) {
        // through the weekly daily-links sync, with a link template without date variables
        test(`file link: ${c.name}`, async () => {
            const { config } = configuration({ ext: c.ext, templates: [{ name: 'dailyLink', template: '[${title}](${link})' }] });
            const sync = new SyncDailyLinks({ config } as unknown as JournalController);
            assert.strictEqual(await sync.renderBlock(path.join(c.from, 'week.md'), [c.file]), c.expected);
        });
    }

    test('link targets', () => {
        for (const c of FIXTURES.linkTargets) {
            assert.deepStrictEqual(linkTargets(c.line), c.expected, c.name);
        }
    });
});
