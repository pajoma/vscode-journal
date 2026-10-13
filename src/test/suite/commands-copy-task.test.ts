import * as assert from 'assert';
import * as vscode from 'vscode';
import { InlineString, InlineTemplate } from '../../shared/model/index';
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
                getTaskInlineTemplate: () => ({ value: '- [ ] ${input}' } as InlineTemplate)
            },
            inject: {
                buildInlineString: async (path: string, _tpl: InlineTemplate, vars: string[]) => ({ path, position: { line: 0, character: 0 }, value: vars[1] } as InlineString),
                injectInlineString: async (inline: InlineString) => {
                    assert.strictEqual(inline.path, entry);
                    injectedValues.push(inline.value);
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
});
