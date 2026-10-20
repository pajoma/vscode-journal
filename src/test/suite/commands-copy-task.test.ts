import * as assert from 'assert';
import * as vscode from 'vscode';
import { InlineTemplate, TemplateLine } from '../../shared/model/index';
import { ShiftTarget, CopyTaskCommand } from '../../features/tasks/commands/copy-task';
import { createMockCtrl } from './command-test-helpers';

suite('Command suites - copy task command', () => {
    test('CopyTaskCommand dispatches all shift targets to entry insertion', async () => {
        const loadedDates: Date[] = [];
        const injectedValues: string[] = [];
        let saveCallCount = 0;

        const fakeDoc = { uri: vscode.Uri.file('/tmp/source.md') } as vscode.TextDocument;
        const entry = '/tmp/entry.md';

        const ctrl = createMockCtrl({
            reader: {
                loadEntryForDay: async (date: Date) => {
                    loadedDates.push(date);
                    return entry;
                }
            },
            config: {
                getTaskInlineTemplate: () => ({ template: '- [ ] ${input}', value: '- [ ] ${input}', after: '' })
            },
            inject: {
                place: async (path: string, _tpl: InlineTemplate, sameKind: (line: string) => boolean, lines: TemplateLine[]) => {
                    assert.strictEqual(path, entry);
                    assert.ok(sameKind('- [ ] an open task'), 'placed with the tasks');
                    injectedValues.push(lines[0].values[0][1]);
                }
            },
            editor: {
                save: async (path: string) => {
                    assert.strictEqual(path, entry);
                    saveCallCount += 1;
                }
            }
        });

        const command = new (CopyTaskCommand as any)(ctrl) as CopyTaskCommand;
        await command.execute(fakeDoc, 'task text', ShiftTarget.today);
        await command.execute(fakeDoc, 'task text', ShiftTarget.tomorrow);
        await command.execute(fakeDoc, 'task text', ShiftTarget.nextWorkingDay);

        assert.strictEqual(loadedDates.length, 3);
        assert.strictEqual(injectedValues.length, 3);
        assert.strictEqual(saveCallCount, 3);

        injectedValues.forEach(value => assert.strictEqual(value, 'task text'));

        const today = new Date();
        assert.strictEqual(loadedDates[0].getDate(), today.getDate());
    });

    test('CopyTaskCommand inserts the open sub-tasks directly below the task (#172)', async () => {
        const placed: TemplateLine[] = [];
        const ctrl = createMockCtrl({
            reader: { loadEntryForDay: async () => '/tmp/entry.md' },
            config: { getTaskInlineTemplate: () => ({ template: '- [ ] ${input}', value: '- [ ] ${input}', after: '' }) },
            inject: {
                place: async (_path: string, _tpl: InlineTemplate, _sameKind: (line: string) => boolean, lines: TemplateLine[]) => { placed.push(...lines); }
            },
            editor: { save: async () => undefined }
        });

        const command = new (CopyTaskCommand as any)(ctrl) as CopyTaskCommand;
        await command.execute({ uri: vscode.Uri.file('/tmp/source.md') } as vscode.TextDocument, 'Ticket', ShiftTarget.today, ['  - [ ] a', '    - [ ] b']);

        assert.deepStrictEqual(placed, [{ values: [['${input}', 'Ticket']], below: ['  - [ ] a', '    - [ ] b'] }], 'one edit: the task, then its sub-tasks');
    });
});
