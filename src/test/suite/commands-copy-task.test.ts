import * as assert from 'assert';
import * as vscode from 'vscode';
import { InlineString, InlineTemplate } from '../../model';
import { ShiftTarget, CopyTaskCommand } from '../../commands/copy-task';
import { createMockCtrl } from './command-test-helpers';

suite('Command suites - copy task command', () => {
    test('CopyTaskCommand dispatches all shift targets to entry insertion', async () => {
        const loadedDates: Date[] = [];
        const injectedValues: string[] = [];
        let saveCallCount = 0;

        const fakeDoc = {
            save: async () => {
                saveCallCount += 1;
                return true;
            }
        } as unknown as vscode.TextDocument;

        const ctrl = createMockCtrl({
            reader: {
                loadEntryForDay: async (date: Date) => {
                    loadedDates.push(date);
                    return fakeDoc;
                }
            },
            config: {
                getTaskInlineTemplate: async () => ({ value: '- [ ] ${input}' } as InlineTemplate)
            },
            inject: {
                computePositionForInput: (_doc: vscode.TextDocument, _tpl: InlineTemplate) => new vscode.Position(0, 0),
                buildInlineString: async (_doc: vscode.TextDocument, _tpl: InlineTemplate, vars: string[]) => ({ value: vars[1] } as InlineString),
                injectInlineString: (inline: InlineString) => {
                    injectedValues.push((inline as any).value ?? '');
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
