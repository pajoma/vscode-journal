import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Container } from '../../app/index';
import { PullPlanItemCommand, targetDay } from '../../features/plans/pull-plan-item';
import { PlanUpdater } from '../../features/plans/update-plans';
import { KeyLinkProvider, OpenPlanItemCommand, PlanEditor } from '../../features/plans/plan-editor';
import { OpenTaskActions } from '../../features/tasks/codeactions/for-open-tasks';
import { refreshScopeFolders } from '../../features/scopes/scope-folders';
import { TestLogger } from '../test-logger';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

/** Plans of scopes and their execution in the journal (docs/specs/2026-11-13-scopes-keys-plans.md). */
suite('Plans', function () {
    this.slow(3000);
    let tmpBase: string;
    let ctrl: Container;
    const disposables: vscode.Disposable[] = [];

    async function write(file: string, text: string): Promise<vscode.Uri> {
        const uri = vscode.Uri.file(path.join(tmpBase, file));
        await vscode.workspace.fs.writeFile(uri, Buffer.from(text));
        return uri;
    }

    const text = async (uri: vscode.Uri) => (await vscode.workspace.openTextDocument(uri)).getText();
    const today = () => {
        const day = targetDay(2);
        return path.join(tmpBase, String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), `${String(day.getDate()).padStart(2, '0')}.md`);
    };

    setup(async () => {
        tmpBase = path.join(os.tmpdir(), `plans-${Date.now()}`);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(tmpBase, 'scopes', 'acme')));
        await write('2026/11/12.md', '# Thursday\n\n- [ ] #acme:4 older work\n');
        ctrl = new Container(new FakeWorkspaceConfig({ base: tmpBase, templates: [{ name: 'task', template: '- [ ] ${input}', after: '## Tasks' }] }), () => new TestLogger(false));
        await refreshScopeFolders(ctrl);
    });

    teardown(async () => {
        disposables.splice(0).forEach(d => d.dispose());
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        try { await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true }); } catch { /* ignore */ }
    });

    test('the target days of the actions', () => {
        const friday = new Date(2026, 10, 13);
        assert.deepStrictEqual([0, 1, 2].map(t => targetDay(t, friday).getDate()), [16, 14, 13]);
    });

    test('a plan item offers to be pulled into a day; an item in progress only to be completed', async () => {
        const plan = await write('scopes/acme/Plan.md', '# Plan\n\n- [ ] interviews\n- [/] #acme:5 guide\n');
        const document = await vscode.workspace.openTextDocument(plan);
        const actions = new OpenTaskActions(ctrl);
        const titles = async (line: number) => ((await actions.provideCodeActions(document, new vscode.Range(line, 0, line, 0), undefined as any, undefined as any)) as vscode.CodeAction[])
            .map(action => `${action.title}${action.command ? ` -> ${action.command.command}` : ''}`);
        assert.deepStrictEqual(await titles(2), [
            'Complete this task',
            'Plan for the next working day -> journal.commands.pull-plan-item',
            'Plan for tomorrow -> journal.commands.pull-plan-item',
            'Plan for today -> journal.commands.pull-plan-item',
        ]);
        assert.deepStrictEqual(await titles(3), ['Complete this task']);
    });

    test('pulling an item gives keys, marks it in progress and copies it into the day', async () => {
        const plan = await write('scopes/acme/Plan.md', '# Plan\n\n## Phase 1\n- [ ] interviews\n  - [ ] guide\n  - [x] invite (done: 2026-11-10 09:00)\n- [ ] report\n');
        const pull = new (PullPlanItemCommand as any)(ctrl, ctrl.index) as PullPlanItemCommand;
        await pull.execute(plan, 3, 2);

        assert.strictEqual(await text(plan), '# Plan\n\n## Phase 1\n- [/] #acme:5 interviews\n  - [/] #acme:6 guide\n  - [x] invite (done: 2026-11-10 09:00)\n- [ ] report\n');
        const entry = await text(vscode.Uri.file(today()));
        assert.ok(entry.includes('- [ ] #acme:5 interviews [[Plan]]\n  - [ ] #acme:6 guide\n'), entry);
    });

    test('the plan follows its execution: done with the day, reopened in progress', async () => {
        const plan = await write('scopes/acme/Plan.md', '# Plan\n\n- [/] #acme:5 interviews\n- [/] #acme:6 guide\n');
        const entry = await write('2026/11/13.md', '# Friday\n\n- [x] #acme:5 interviews [[Plan]] (done: 2026-11-13 10:00)\n- [ ] #acme:6 guide\n');
        const updater = new PlanUpdater(ctrl, ctrl.index);
        disposables.push(updater);

        await updater.update(entry);
        assert.strictEqual(await text(plan), '# Plan\n\n- [x] #acme:5 interviews (done: 2026-11-13 10:00) [[2026-11-13]]\n- [/] #acme:6 guide\n');

        await write('2026/11/13.md', '# Friday\n\n- [ ] #acme:5 interviews [[Plan]]\n- [ ] #acme:6 guide\n');
        await updater.update(entry);
        assert.strictEqual(await text(plan), '# Plan\n\n- [/] #acme:5 interviews\n- [/] #acme:6 guide\n');

        await updater.update(plan);
        assert.strictEqual(await text(plan), '# Plan\n\n- [/] #acme:5 interviews\n- [/] #acme:6 guide\n', 'a plan file changes no plan');
    });

    test('a key that two plan items have is an error', async () => {
        await write('scopes/acme/Other.md', '- [ ] #acme:5 elsewhere\n');
        const plan = await write('scopes/acme/Plan.md', '# Plan\n\n- [ ] #acme:5 interviews\n- [ ] #acme:6 guide\n');
        await vscode.window.showTextDocument(plan);
        const editor = new PlanEditor(ctrl, ctrl.index);
        disposables.push(editor);
        await editor.update();
        const found = vscode.languages.getDiagnostics(plan).filter(d => d.source === undefined || d.message.includes('#acme:5'));
        assert.deepStrictEqual(found.map(d => d.range.start.line), [2]);
    });

    test('the identifier of a key in an entry links to its plan item, which opens', async () => {
        const plan = await write('scopes/acme/Plan.md', '# Plan\n\n- [/] #acme:5 interviews\n');
        const entry = await write('2026/11/13.md', '# Friday\n\n- [ ] #acme:5 interviews [[Plan]]\n- [ ] :2 bank\n');
        const links = new KeyLinkProvider(ctrl).provideDocumentLinks(await vscode.workspace.openTextDocument(entry));
        assert.deepStrictEqual(links.map(l => [l.range.start.line, l.range.start.character, l.range.end.character]), [[2, 11, 13]]);
        assert.deepStrictEqual(new KeyLinkProvider(ctrl).provideDocumentLinks(await vscode.workspace.openTextDocument(plan)), [], 'none in the plan');

        const open = new (OpenPlanItemCommand as any)(ctrl, ctrl.index) as OpenPlanItemCommand;
        assert.strictEqual(await open.execute('#ACME:5'), true);
        assert.strictEqual(vscode.window.activeTextEditor?.document.uri.fsPath, plan.fsPath);
        assert.strictEqual(vscode.window.activeTextEditor?.selection.active.line, 2);
    });
});
