import * as assert from 'assert';
import * as vscode from 'vscode';
import * as J from '../..';
import { PrintTimeCommand } from '../../provider/commands/print-current-time';
import { PrintSumCommand } from '../../provider/commands/print-sum-of-selected-numbers';
import { PrintDurationCommand } from '../../provider/commands/print-duration-between-selected-times';
import { createMockCtrl, openEditor } from './command-test-helpers';

suite('Command suites - print commands', () => {
    test('PrintTimeCommand injects configured time at current cursor', async () => {
        const editor = await openEditor('hello');
        editor.selection = new vscode.Selection(0, 2, 0, 2);

        let injectedText = '';
        let injectedPosition: vscode.Position | undefined;

        const ctrl = createMockCtrl({
            config: {
                getTimeStringTemplate: async () => ({ value: '08:15' } as J.Model.ScopedTemplate)
            },
            inject: {
                injectString: (_doc: vscode.TextDocument, text: string, target: vscode.Position) => {
                    injectedText = text;
                    injectedPosition = target;
                }
            }
        });

        const command = new (PrintTimeCommand as any)(ctrl) as PrintTimeCommand;
        await command.printTime();

        assert.strictEqual(injectedText, '08:15');
        assert.ok(injectedPosition);
        assert.strictEqual(injectedPosition!.line, 0);
        assert.strictEqual(injectedPosition!.character, 2);
    });

    test('PrintSumCommand computes sum for selected values and injects result', async () => {
        const editor = await openEditor('2 2\n');
        editor.selections = [
            new vscode.Selection(0, 0, 0, 0),
            new vscode.Selection(0, 2, 0, 2),
            new vscode.Selection(1, 0, 1, 0)
        ];

        let injectedText = '';

        const ctrl = createMockCtrl({
            inject: {
                injectString: (_doc: vscode.TextDocument, text: string, _target: vscode.Position) => {
                    injectedText = text;
                }
            }
        });

        const command = new (PrintSumCommand as any)(ctrl) as PrintSumCommand;
        await command.execute();

        assert.strictEqual(injectedText, '4');
    });

    test('PrintDurationCommand computes decimal hours and injects result', async () => {
        const editor = await openEditor('08:00 10:30 ');
        editor.selections = [
            new vscode.Selection(0, 0, 0, 0),
            new vscode.Selection(0, 6, 0, 6),
            new vscode.Selection(0, 11, 0, 11)
        ];

        let injectedText = '';

        const ctrl = createMockCtrl({
            inject: {
                injectString: (_doc: vscode.TextDocument, text: string, _target: vscode.Position) => {
                    injectedText = text;
                }
            }
        });

        const command = new (PrintDurationCommand as any)(ctrl) as PrintDurationCommand;
        await command.printDuration();

        assert.strictEqual(injectedText, '2.50');
    });
});
