import * as vscode from 'vscode';
import { InlineString, InlineTemplate, Input, NoteInput, ScopedTemplate } from '../../shared/model/index';
import { TestLogger } from '../test-logger';

export type MockCtrl = any;

export function createMockCtrl(overrides: Partial<MockCtrl> = {}): MockCtrl {
    const calls: { showError: string[] } = { showError: [] };
    const ctrl: MockCtrl = {
        __calls: calls,
        logger: new TestLogger(false),
        events: {
            onEntryOpened: (_listener: unknown) => ({ dispose() { } }),
            fireEntryOpened: (_event: unknown) => undefined,
        },
        editor: {
            open: async (_path: unknown) => ({ uri: vscode.Uri.file('/tmp/test.md') } as vscode.TextDocument),
            save: async (doc: vscode.TextDocument) => doc,
            createAndOpen: async (_path: string, _content: string) => ({ uri: vscode.Uri.file('/tmp/test.md') } as vscode.TextDocument),
            applyInlineStrings: async (content: InlineString) => content.document,
        },
        ui: {
            showDocument: async (_doc: vscode.TextDocument) => undefined,
            showError: (msg: string) => calls.showError.push(msg),
            getUserInputWithValidation: async () => new Input(),
            getUserInput: async () => 'note title'
        },
        reader: {
            loadEntryForInput: async (_input: Input) => ({ uri: vscode.Uri.file('/tmp/test.md') } as vscode.TextDocument),
            loadEntryForDay: async (_date: Date) => ({ save: async () => true } as unknown as vscode.TextDocument)
        },
        inject: {
            injectInput: async (doc: vscode.TextDocument, _input: Input) => doc,
            injectString: (_doc: vscode.TextDocument, _text: string, _target: vscode.Position) => undefined,
            computePositionForInput: (_doc: vscode.TextDocument, _tpl: InlineTemplate) => new vscode.Position(0, 0),
            buildInlineString: async (_doc: vscode.TextDocument, _tpl: InlineTemplate, vars: string[]) => ({ value: vars[1] } as InlineString),
            injectInlineString: (_inline: InlineString) => undefined
        },
        config: {
            getTimeStringTemplate: async () => ({ value: '12:34' } as ScopedTemplate),
            getTaskInlineTemplate: async () => ({ value: '- [ ] ${input}' } as InlineTemplate),
            getBasePath: () => '/tmp/journal-tests',
            getBasePathForLocalOpen: () => '/tmp/journal-tests',
            getFileExtension: () => 'md',
            getScopes: () => ['default'],
            getWeeksPathPatternRaw: () => '${base}/${year}',
            getWeeksFilePatternRaw: () => 'week_${week}.${ext}',
            getWeeklySyncConfig: () => ({ enabled: true, anchor: '## Daily Entries', template: '- [${weekday}](${link})', sortOrder: 'ascending' }),
            getResolvedEntryPath: async () => ({ value: '/tmp/journal-tests/2026/05' }),
            getEntryFilePattern: async () => ({ value: '17.md' }),
            getResolvedEntryPathForLocalOpen: async () => ({ value: '/tmp/journal-tests/2026/05' }),
            getWeekFilePattern: async () => ({ value: 'week_20.md' }),
            getWeekPathPatternForLocalOpen: async () => ({ value: '/tmp/journal-tests/2026' })
        },
        parser: {
            parseInput: async (input: string) => {
                const parsed = new NoteInput();
                parsed.text = input;
                return parsed;
            }
        }
    };

    return { ...ctrl, ...overrides };
}

export async function openEditor(content: string): Promise<vscode.TextEditor> {
    const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content });
    return vscode.window.showTextDocument(doc);
}

export async function tick(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0));
}
