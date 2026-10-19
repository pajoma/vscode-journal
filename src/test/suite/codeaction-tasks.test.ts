import * as assert from 'assert';
import * as vscode from 'vscode';
import { OpenTaskActions } from '../../features/tasks/codeactions/for-open-tasks';
import { CompletedTaskActions } from '../../features/tasks/codeactions/for-completed-tasks';
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
                    getTaskInlineTemplate: () => ({ template: '- [ ] ${input}', value: '- [ ] ${input}', after: '' }),
                    getTimeStringTemplate: () => ({ template: '12:34', value: '12:34' }),
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

    suite('Sub-tasks (#172)', () => {
        const TICKET = [
            '- [ ] Ticket XX-1155',
            '  - [ ] update records',
            '  - [x] verify records (done: 2026-10-19 10:00)',
            '  - [ ] create requests',
            '- [ ] Another task',
            '',
        ].join('\n');
        const ctrl = () => createMockCtrl({
            config: { getTaskInlineTemplate: () => ({ template: '- [ ] ${input}', value: '- [ ] ${input}', after: '' }) }
        });
        const actionsFor = async (doc: vscode.TextDocument, line: number) =>
            await new OpenTaskActions(ctrl()).provideCodeActions(doc, makeRange(line, 0, doc.lineAt(line).text.length), makeContext(),
                new vscode.CancellationTokenSource().token) as vscode.CodeAction[];
        const titled = (actions: vscode.CodeAction[], title: string) => {
            const action = actions.find(a => a.title === title);
            assert.ok(action, `expected action '${title}' in: ${actions.map(a => a.title).join(', ')}`);
            return action!;
        };

        test('a task with open sub-tasks offers to complete it alone or with them', async () => {
            const doc = (await openEditor(TICKET)).document;
            const titles = (await actionsFor(doc, 0)).map(a => a.title);
            assert.ok(titles.includes('Complete this task'), `got: ${titles}`);
            assert.ok(titles.includes('Complete this task and its 2 open sub-tasks'), `got: ${titles}`);
            assert.ok(!(await actionsFor(doc, 4)).some(a => a.title.includes('sub-task')), 'no sub-task action without sub-tasks');
        });

        test('completing with sub-tasks marks the open ones done; done ones keep their time', async () => {
            const doc = (await openEditor(TICKET)).document;
            await vscode.workspace.applyEdit(titled(await actionsFor(doc, 0), 'Complete this task and its 2 open sub-tasks').edit!);
            const lines = doc.getText().split('\n');
            assert.match(lines[0], /^- \[x\] Ticket XX-1155 \(done: .+\)$/);
            assert.match(lines[1], /^ {2}- \[x\] update records \(done: .+\)$/);
            assert.strictEqual(lines[2], '  - [x] verify records (done: 2026-10-19 10:00)', 'a done sub-task keeps its time');
            assert.match(lines[3], /^ {2}- \[x\] create requests \(done: .+\)$/);
            assert.strictEqual(lines[4], '- [ ] Another task', 'the next task is not a sub-task');
        });

        test('completing the task alone leaves its sub-tasks open', async () => {
            const doc = (await openEditor(TICKET)).document;
            await vscode.workspace.applyEdit(titled(await actionsFor(doc, 0), 'Complete this task').edit!);
            const lines = doc.getText().split('\n');
            assert.match(lines[0], /^- \[x\] /);
            assert.strictEqual(lines[1], '  - [ ] update records');
            assert.strictEqual(lines[3], '  - [ ] create requests');
        });

        test('planning a task for another day marks its open sub-tasks moved and takes them along', async () => {
            const doc = (await openEditor(TICKET)).document;
            const plan = titled(await actionsFor(doc, 0), 'Plan for tomorrow');
            await vscode.workspace.applyEdit(plan.edit!);
            const lines = doc.getText().split('\n');
            assert.match(lines[0], /^- \[>\] Ticket XX-1155 \(moved: .+\)$/);
            assert.match(lines[1], /^ {2}- \[>\] update records \(moved: .+\)$/);
            assert.strictEqual(lines[2], '  - [x] verify records (done: 2026-10-19 10:00)', 'a done sub-task stays as it is');
            assert.match(lines[3], /^ {2}- \[>\] create requests \(moved: .+\)$/);
            assert.deepStrictEqual(plan.command!.arguments!.slice(1),
                ['Ticket XX-1155', 1 /* ShiftTarget.tomorrow */, ['  - [ ] update records', '  - [ ] create requests']],
                'the copy command gets the task and its open sub-tasks');
        });

        test('reopen recognises an uppercase [X]', async () => {
            const doc = (await openEditor('- [X] upper (done: 2026-10-19 10:00)\n')).document;
            const actions = await new CompletedTaskActions(createMockCtrl()).provideCodeActions(doc, makeRange(0, 0, doc.lineAt(0).text.length),
                makeContext(), new vscode.CancellationTokenSource().token) as vscode.CodeAction[];
            assert.ok(Array.isArray(actions) && actions.length === 1, 'expected the reopen action');
            await vscode.workspace.applyEdit(actions[0].edit!);
            assert.strictEqual(doc.getText(), '- [ ] upper\n');
        });
    });
});
