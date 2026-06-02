import * as assert from 'assert';
import * as vscode from 'vscode';
import { OpenTaskActions } from '../../ui/codeactions/for-open-tasks';
import { CompletedTaskActions } from '../../ui/codeactions/for-completed-tasks';
import { InlineTemplate, ScopedTemplate } from '../../model';
import { createMockCtrl, openEditor } from './command-test-helpers';

function makeRange(line: number, startChar: number, endChar: number): vscode.Range {
    return new vscode.Range(line, startChar, line, endChar);
}

function makeContext(): vscode.CodeActionContext {
    return {
        diagnostics: [],
        only: undefined,
        triggerKind: vscode.CodeActionTriggerKind.Invoke
    };
}

suite('Code actions — task state transitions', function () {
    this.slow(3000);

    suite('OpenTaskActions (open → completed)', () => {
        test('happy: open-task line returns Complete action; applying edit marks [x] + timestamp', async () => {
            const editor = await openEditor('- [ ] write tests\n');
            const doc = editor.document;
            const line = doc.lineAt(0);
            const range = makeRange(0, 0, line.text.length);
            const token = new vscode.CancellationTokenSource().token;
            const ctrl = createMockCtrl({
                config: {
                    getTaskInlineTemplate: async () => ({ template: '- [ ] ${input}', value: '- [ ] ${input}' } as InlineTemplate),
                    getTimeStringTemplate: async () => ({ value: '12:34' } as ScopedTemplate),
                    getBasePath: () => '/tmp/journal-tests',
                    getBasePathForLocalOpen: () => '/tmp/journal-tests'
                }
            });

            const provider = new OpenTaskActions(ctrl);
            const actions = await provider.provideCodeActions(doc, range, makeContext(), token) as vscode.CodeAction[];

            assert.ok(Array.isArray(actions) && actions.length > 0, 'expected at least one action');
            const completeAction = actions[0];
            assert.ok(completeAction.edit, 'action must have a WorkspaceEdit');

            await vscode.workspace.applyEdit(completeAction.edit!);

            const updated = doc.getText();
            assert.ok(updated.includes('[x]'), `expected [x] in: ${updated}`);
            assert.ok(updated.includes('done:'), `expected done: timestamp in: ${updated}`);
        });

        test('error: non-task line returns no actions', async () => {
            const editor = await openEditor('# Just a heading\n');
            const doc = editor.document;
            const range = makeRange(0, 0, doc.lineAt(0).text.length);
            const token = new vscode.CancellationTokenSource().token;
            const ctrl = createMockCtrl();

            const provider = new OpenTaskActions(ctrl);
            const result = await provider.provideCodeActions(doc, range, makeContext(), token);

            assert.ok(!result || (Array.isArray(result) && result.length === 0), 'expected no actions for non-task line');
        });
    });

    suite('CompletedTaskActions (completed → open)', () => {
        test('happy: completed-task line returns Reopen action; applying edit restores [ ] and strips annotation', async () => {
            const editor = await openEditor('- [x] write tests (done: 2026-05-15 10:00)\n');
            const doc = editor.document;
            const range = makeRange(0, 0, doc.lineAt(0).text.length);
            const token = new vscode.CancellationTokenSource().token;
            const ctrl = createMockCtrl();

            const provider = new CompletedTaskActions(ctrl);
            const actions = await provider.provideCodeActions(doc, range, makeContext(), token) as vscode.CodeAction[];

            assert.ok(Array.isArray(actions) && actions.length > 0, 'expected at least one action');
            const reopenAction = actions[0];
            assert.ok(reopenAction.edit, 'action must have a WorkspaceEdit');

            await vscode.workspace.applyEdit(reopenAction.edit!);

            const updated = doc.getText();
            assert.ok(updated.includes('[ ]'), `expected [ ] in: ${updated}`);
            assert.ok(!updated.includes('done:'), `expected done: annotation removed, got: ${updated}`);
        });

        test('error: open-task line returns no actions', async () => {
            const editor = await openEditor('- [ ] still open\n');
            const doc = editor.document;
            const range = makeRange(0, 0, doc.lineAt(0).text.length);
            const token = new vscode.CancellationTokenSource().token;
            const ctrl = createMockCtrl();

            const provider = new CompletedTaskActions(ctrl);
            const result = await provider.provideCodeActions(doc, range, makeContext(), token);

            assert.ok(!result || (Array.isArray(result) && result.length === 0), 'expected no actions for open-task line');
        });
    });
});
