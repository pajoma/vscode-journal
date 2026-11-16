import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Container } from '../../app/index';
import { PullPlanItemCommand, targetDay } from '../../features/plans/pull-plan-item';
import { PlanUpdater } from '../../features/plans/update-plans';
import { PlanNumbering } from '../../features/plans/plan-numbers';
import { KeyLinkProvider, OpenPlanItemCommand, PlanEditor } from '../../features/plans/plan-editor';
import { OpenTaskActions } from '../../features/tasks/codeactions/for-open-tasks';
import { refreshScopeFolders } from '../../features/scopes/scope-folders';
import { ScopeReports } from '../../features/scopes/scope-report';
import { scopeOfPage } from '../../shared/journal/plan-pages';
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
        ctrl = new Container(new FakeWorkspaceConfig({ base: tmpBase, 'taskSync.enabled': true, templates: [{ name: 'task', template: '- [ ] ${input}', after: '## Tasks' }] }), () => new TestLogger(false));
        await refreshScopeFolders(ctrl);
    });

    /** The numbering of plans, disposed after the test. */
    const numbering = () => {
        const service = new PlanNumbering(ctrl, ctrl.index);
        disposables.push(service);
        return service;
    };

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
        assert.deepStrictEqual(await titles(3), ['Complete this task -> journal.commands.tasks-changed'], 'a task with a key announces its change');
    });

    test('without task sync, pulling numbers the plan: the copy has the scope, the number and the plan, and the plan follows it', async () => {
        ctrl = new Container(new FakeWorkspaceConfig({ base: tmpBase, templates: [{ name: 'task', template: '- [ ] ${input}', after: '## Tasks' }] }), () => new TestLogger(false));
        await refreshScopeFolders(ctrl);
        const plan = await write('scopes/acme/Plan.md', '# Plan\n\n## Phase 1\n- [ ] interviews\n  - [ ] guide\n- [ ] call #acme team\n');
        const pull = new (PullPlanItemCommand as any)(ctrl, ctrl.index, numbering()) as PullPlanItemCommand;
        await pull.execute(plan, 3, 2);
        await pull.execute(plan, 5, 2);

        assert.strictEqual(await text(plan), '# Plan\n\n## Phase 1\n- [/] 1. interviews\n  - [/] 1.1 guide\n- [/] 2. call #acme team\n');
        const entry = await text(vscode.Uri.file(today()));
        assert.ok(entry.includes('- [ ] #acme 1. interviews [[Plan]]\n  - [ ] 1.1 guide\n- [ ] 2. call #acme team [[Plan]]\n'), entry);

        // the sub-task done in the journal: its plan item follows, by number
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(today()));
        const line = document.getText().split('\n').findIndex(l => l.includes('1.1 guide'));
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, document.lineAt(line).range, '  - [x] 1.1 guide (done: 2026-11-16 10:00)');
        await vscode.workspace.applyEdit(edit);
        await document.save();
        ctrl.index.invalidate();
        await new PlanUpdater(ctrl, ctrl.index).update(document.uri);
        assert.match(await text(plan), /  - \[x\] 1\.1 guide \(done: 2026-11-16 10:00\) \[\[\d{4}-\d{2}-\d{2}\]\]\n/);
    });

    test('a numbered plan is renumbered when saved, and the copies in the journal get the new numbers', async () => {
        const plan = await write('scopes/acme/Plan.md', '# Plan\n\n- [/] 1. interviews\n- [/] 2. report\n');
        const entry = await write('2026/11/13.md', '# Friday\n\n- [ ] #acme 2. report [[Plan]]\n- [ ] #acme 1. interviews [[Plan]]\n- [ ] #web 1. other [[Plan]]\n');
        numbering();
        const document = await vscode.workspace.openTextDocument(plan);
        const edit = new vscode.WorkspaceEdit();
        edit.insert(plan, new vscode.Position(2, 0), '- [ ] kickoff\n');
        await vscode.workspace.applyEdit(edit);
        await document.save();
        assert.strictEqual(await text(plan), '# Plan\n\n- [ ] 1. kickoff\n- [/] 2. interviews\n- [/] 3. report\n');
        for (let i = 0; i < 40 && !(await text(entry)).includes('3. report'); i++) { await new Promise(resolve => setTimeout(resolve, 100)); }
        assert.strictEqual(await text(entry), '# Friday\n\n- [ ] #acme 3. report [[Plan]]\n- [ ] #acme 2. interviews [[Plan]]\n- [ ] #web 1. other [[Plan]]\n');
        assert.strictEqual(new TextDecoder().decode(await vscode.workspace.fs.readFile(entry)), await text(entry), 'saved');
    });

    test('a plan without numbers is not numbered when saved', async () => {
        const plan = await write('scopes/acme/Notes.md', '# Notes\n\n- [ ] 3 calls to make\n- [ ] plain\n');
        numbering();
        const document = await vscode.workspace.openTextDocument(plan);
        const edit = new vscode.WorkspaceEdit();
        edit.insert(plan, new vscode.Position(4, 0), '- [ ] more\n');
        await vscode.workspace.applyEdit(edit);
        await document.save();
        assert.strictEqual(await text(plan), '# Notes\n\n- [ ] 3 calls to make\n- [ ] plain\n- [ ] more\n');
    });

    test('pulling an item gives keys, marks it in progress and copies it into the day', async () => {
        const plan = await write('scopes/acme/Plan.md', '# Plan\n\n## Phase 1\n- [ ] interviews\n  - [ ] guide\n  - [x] invite (done: 2026-11-10 09:00)\n- [ ] report\n');
        const pull = new (PullPlanItemCommand as any)(ctrl, ctrl.index, numbering()) as PullPlanItemCommand;
        await pull.execute(plan, 3, 2);

        assert.strictEqual(await text(plan), '# Plan\n\n## Phase 1\n- [/] #acme:5 1. interviews\n  - [/] #acme:6 1.1 guide\n  - [x] 1.2 invite (done: 2026-11-10 09:00)\n- [ ] 2. report\n');
        assert.strictEqual(new TextDecoder().decode(await vscode.workspace.fs.readFile(plan)), await text(plan), 'the plan is saved with the entry');
        const entry = await text(vscode.Uri.file(today()));
        assert.ok(entry.includes('- [ ] #acme:5 1. interviews [[Plan]]\n  - [ ] #acme:6 1.1 guide\n'), entry);
    });

    test('the copy of a pulled item is written with the task template of its scope', async () => {
        ctrl = new Container(new FakeWorkspaceConfig({
            base: tmpBase,
            'taskSync.enabled': true,
            templates: [{ name: 'task', template: '- [ ] ${input}', after: '## Tasks' }],
            scopes: [{ name: 'acme', base: '${base}/scopes/acme', templates: [{ name: 'task', template: '- [ ] ACME ${input}', after: '## Tasks' }] }],
        }), () => new TestLogger(false));
        await refreshScopeFolders(ctrl);
        const plan = await write('scopes/acme/Plan.md', '# Plan\n\n- [ ] interviews\n');
        const pull = new (PullPlanItemCommand as any)(ctrl, ctrl.index, numbering()) as PullPlanItemCommand;
        await pull.execute(plan, 2, 2);

        const entry = await text(vscode.Uri.file(today()));
        assert.ok(entry.includes('- [ ] ACME #acme:5 1. interviews [[Plan]]\n'), entry);
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

    test('saving a file that is no entry reads nothing of the journal', async () => {
        const plan = await write('scopes/acme/Plan.md', '# Plan\n\n- [/] #acme:5 interviews\n');
        const updater = new PlanUpdater(ctrl, ctrl.index);
        disposables.push(updater);
        let reads = 0;
        const read = ctrl.index.texts.read.bind(ctrl.index.texts);
        ctrl.index.texts.read = async (path: string) => { reads++; return read(path); };

        await updater.update(plan);
        await updater.update(vscode.Uri.file(path.join(tmpBase, 'scopes', 'acme', 'other.txt')));
        assert.strictEqual(reads, 0);
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

    test('the report of a scope: a page in its folder with wiki links, its plan and its tasks of the last 30 days', async () => {
        await write('scopes/acme/Plan.md', '# Plan\n\n## Phase 1\n- [/] #acme:5 interviews\n');
        await write('2026/11/13.md', '# Friday\n\n- [ ] #acme:5 interviews [[Plan]]\n- [ ] :2 bank\n');
        const reports = new ScopeReports(ctrl, ctrl.index);
        const page = await reports.write('acme', new Date(2026, 10, 13));
        assert.strictEqual(page, path.join(tmpBase, 'scopes', 'acme', 'acme.report.md'));
        const report = new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.file(page!)));
        assert.ok(report.startsWith('# #acme\n\nPlan: 0 open, 1 in progress, 0 done. Journal 2026-10-15 – 2026-11-13: 0 done.'), report);
        assert.ok(report.includes('### [[Plan]]\n\n#### Phase 1\n\n- [/] #acme:5 interviews\n'), report);
        assert.ok(report.includes('### [[2026-11-13]]\n\n- [ ] #acme:5 interviews [[Plan]]\n'), report);
        assert.ok(!report.includes(':2 bank'));
        assert.ok(report.includes('## Notes\n\n- [[Plan]] (2026-11-13)\n\n## Journal'), report);
        assert.strictEqual(await reports.write('nope'), undefined);

        // the report is no plan: written again, it does not report itself, and its tasks are no plan items
        ctrl.index.invalidate();
        const again = await reports.report('acme', new Date(2026, 10, 13));
        assert.strictEqual(again, report);
        assert.strictEqual(scopeOfPage(ctrl.config, page!), undefined);
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
