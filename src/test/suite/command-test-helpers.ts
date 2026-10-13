import * as assert from 'assert';
import * as vscode from 'vscode';
import { InlineString, InlineTemplate, Input, JournalController, NoteInput, TextPosition } from '../../shared/model/index';
import { TestLogger } from '../test-logger';

/** Services and their members may be left out; what a mock defines must match the real signature (#278). */
export type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends (...args: never[]) => unknown ? T[K] : DeepPartial<T[K]>;
};

export type MockCtrlOverrides = DeepPartial<JournalController>;

/** A controller for tests; members a test did not mock are missing at runtime. */
export type MockCtrl = JournalController & { __calls: { showError: string[] } };

export function createMockCtrl(overrides: MockCtrlOverrides = {}): MockCtrl {
    const calls: { showError: string[] } = { showError: [] };
    const ctrl: MockCtrlOverrides = {
        logger: new TestLogger(false),
        events: {
            onEntryOpened: (_listener: unknown) => ({ dispose() { } }),
            fireEntryOpened: (_event: unknown) => undefined,
            onNoteCreated: (_listener: unknown) => ({ dispose() { } }),
            fireNoteCreated: (_event: unknown) => undefined,
        },
        ui: {
            showError: async (msg: string | Error) => { calls.showError.push(String(msg)); },
            getUserInputWithValidation: async () => new Input(),
            getUserInput: async () => 'note title'
        },
        // fails clearly instead of 'reading open of undefined' when a test unexpectedly opens a note
        notes: {
            open: async () => assert.fail('ctrl.notes.open was not expected in this test'),
        },
        editor: {
            getText: async (_path: string) => '',
            insert: async (_inserts: InlineString[]) => undefined,
            save: async (_path: string) => undefined,
            show: async (_path: string) => undefined,
        },
        reader: {
            loadEntryForInput: async (_input: Input) => '/tmp/test.md',
            loadEntryForDay: async (_date: Date) => '/tmp/test.md'
        },
        inject: {
            injectInput: async (path: string, _input: Input) => path,
            injectString: async (_path: string, _text: string, _target: TextPosition) => undefined,
            computePositionForInput: (_text: string, _tpl: InlineTemplate) => ({ line: 0, character: 0 }),
            buildInlineString: async (path: string, _tpl: InlineTemplate, vars: string[]) => ({ path, position: { line: 0, character: 0 }, value: vars[1] } as InlineString),
            injectInlineString: async (_inline: InlineString) => undefined
        },
        config: {
            getTimeStringTemplate: () => ({ template: '12:34', value: '12:34' }),
            getTaskInlineTemplate: () => ({ template: '- [ ] ${input}', value: '- [ ] ${input}', after: '' }),
            getBasePath: () => '/tmp/journal-tests',
            getBasePathForLocalOpen: () => '/tmp/journal-tests',
            getFileExtension: () => 'md',
            getScopes: () => ['default'],
            getWeeksPathPatternRaw: () => '${base}/${year}',
            getWeeksFilePatternRaw: () => 'week_${week}.${ext}',
            getWeeklySyncConfig: () => ({ enabled: true, anchor: '## Daily Entries', template: '- [${weekday}](${link})', sortOrder: 'ascending' }),
            getResolvedEntryPath: () => ({ template: '', value: '/tmp/journal-tests/2026/05' }),
            getEntryFilePattern: () => ({ template: '', value: '17.md' }),
            getResolvedEntryPathForLocalOpen: () => ({ template: '', value: '/tmp/journal-tests/2026/05' }),
            getWeekFilePattern: () => ({ template: '', value: 'week_20.md' }),
            getWeekPathPatternForLocalOpen: () => ({ template: '', value: '/tmp/journal-tests/2026' })
        },
        parser: {
            parseInput: async (input: string) => {
                const parsed = new NoteInput();
                parsed.text = input;
                return parsed;
            }
        }
    };

    // the single place where the partial mock stands in for the whole controller
    return { ...ctrl, ...overrides, __calls: calls } as unknown as MockCtrl;
}

export async function openEditor(content: string): Promise<vscode.TextEditor> {
    const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content });
    return vscode.window.showTextDocument(doc);
}

export async function tick(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0));
}
