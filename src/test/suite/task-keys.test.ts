import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Container } from '../../app/index';
import { SetKeyActions, SetKeyCommand } from '../../features/tasks/codeactions/set-key';
import { ScopeTagHover, ScopeTagLinkProvider } from '../../features/scopes/scope-tags';
import { refreshScopeFolders } from '../../features/scopes/scope-folders';
import { TestLogger } from '../test-logger';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

/** Keys of tasks and "Add Key" (docs/specs/2026-11-13-scopes-keys-plans.md). */
suite('Task keys', () => {
    let tmpBase: string;
    let ctrl: Container;

    async function write(file: string, text: string): Promise<vscode.Uri> {
        const uri = vscode.Uri.file(path.join(tmpBase, file));
        await vscode.workspace.fs.writeFile(uri, Buffer.from(text));
        return uri;
    }

    setup(async () => {
        tmpBase = path.join(os.tmpdir(), `task-keys-${Date.now()}`);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(tmpBase, 'scopes', 'acme')));
        await write('2026/11/12.md', '# Thursday\n\n- [ ] #acme:4 write guide\n- [x] :2 call the bank\n');
        await write('scopes/acme/Plan.md', '# Plan\n\n- [ ] #acme:9 interview\n');
        ctrl = new Container(new FakeWorkspaceConfig({ base: tmpBase, 'taskSync.enabled': true }), () => new TestLogger(false));
        await refreshScopeFolders(ctrl);
    });

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        try { await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true }); } catch { /* ignore */ }
    });

    test('the next key counts over entries and scope notes, per scope', async () => {
        assert.deepStrictEqual(await ctrl.keys.next('acme'), { scope: 'acme', number: 10 });
        assert.deepStrictEqual(await ctrl.keys.next(), { scope: undefined, number: 3 });
    });

    test('Add Key is offered on journal tasks without key, not on keyed or moved ones', async () => {
        const uri = await write('2026/11/13.md', '# Friday\n\n- [ ] call #Acme\n- [ ] #acme:4 keyed\n- [>] moved (moved: 2026-11-14)\n- [x] done without key\n');
        const document = await vscode.workspace.openTextDocument(uri);
        const actions = new SetKeyActions(ctrl);
        const offered = (line: number) => actions.provideCodeActions(document, new vscode.Range(line, 0, line, 0)).length > 0;
        assert.deepStrictEqual([0, 2, 3, 4, 5].map(offered), [false, true, false, false, true]);

        const outside = await vscode.workspace.openTextDocument({ language: 'markdown', content: '- [ ] not in the journal' });
        assert.strictEqual(actions.provideCodeActions(outside, new vscode.Range(0, 0, 0, 0)).length, 0);
    });

    test('without task sync, Add Key is not offered', async () => {
        ctrl = new Container(new FakeWorkspaceConfig({ base: tmpBase }), () => new TestLogger(false));
        const document = await vscode.workspace.openTextDocument(await write('2026/11/13.md', '# Friday\n\n- [ ] call #acme\n- [ ] call the bank\n'));
        const actions = new SetKeyActions(ctrl);
        assert.deepStrictEqual([2, 3].map(line => actions.provideCodeActions(document, new vscode.Range(line, 0, line, 0)).length), [0, 0]);
    });

    test('Add Key gives the key of the named scope in its place, else the default key in front', async () => {
        const uri = await write('2026/11/13.md', '# Friday\n\n- [ ] call #Acme today\n  - [ ] call the bank\n');
        const command = new (SetKeyCommand as any)(ctrl) as SetKeyCommand;

        assert.strictEqual(await command.execute(uri, 2), '#acme:10');
        assert.strictEqual(await command.execute(uri, 3), ':3');
        assert.strictEqual(await command.execute(uri, 2), undefined, 'a keyed task keeps its key');

        const document = await vscode.workspace.openTextDocument(uri);
        assert.deepStrictEqual([document.lineAt(2).text, document.lineAt(3).text], ['- [ ] call #acme:10 today', '  - [ ] :3 call the bank']);
        assert.deepStrictEqual(await ctrl.keys.next('acme'), { scope: 'acme', number: 11 }, 'the unsaved key counts');
    });

    test('Add Key in a plan gives a task without scope tag the key of the plan\'s scope', async () => {
        const uri = await write('scopes/acme/Plan.md', '# Plan\n\n- [ ] #acme:9 interview\n- [ ] write guide\n');
        const command = new (SetKeyCommand as any)(ctrl) as SetKeyCommand;

        assert.strictEqual(await command.execute(uri, 3), '#acme:10');
        const document = await vscode.workspace.openTextDocument(uri);
        assert.strictEqual(document.lineAt(3).text, '- [ ] #acme:10 write guide');
    });

    test('scope tags link to the scope, also in keys; other tags and files outside the journal do not', async () => {
        const uri = await write('2026/11/13.md', '# Friday\n\n- [ ] #Acme:4 write guide #urgent\nsee #acme\n');
        const links = new ScopeTagLinkProvider(ctrl).provideDocumentLinks(await vscode.workspace.openTextDocument(uri));
        assert.deepStrictEqual(links.map(link => [link.range.start.line, link.range.start.character, link.range.end.character]), [[2, 6, 11], [3, 4, 9]]);
        assert.strictEqual(links[0].target!.toString(true), `command:journal.showScope?${JSON.stringify(['acme'])}`);

        const outside = await vscode.workspace.openTextDocument({ language: 'markdown', content: 'see #acme' });
        assert.deepStrictEqual(new ScopeTagLinkProvider(ctrl).provideDocumentLinks(outside), []);
    });

    test('hovering a scope tag shows its plan and links to its report; other tags and files outside the journal show nothing', async () => {
        await write('scopes/acme/Plan.md', '# Plan\n\n- [ ] #acme:9 interview\n- [/] #acme:10 guide\n- [x] invite\n- [>] moved\n');
        const document = await vscode.workspace.openTextDocument(await write('2026/11/13.md', '# Friday\n\n- [ ] #Acme:4 write guide #urgent\n'));
        const hover = new ScopeTagHover(ctrl, ctrl.index);
        const shown = await hover.provideHover(document, new vscode.Position(2, 8));
        const text = (shown!.contents[0] as vscode.MarkdownString).value;
        assert.ok(text.startsWith('**#acme** · Plan: 1 open, 1 in progress, 1 done'), text);
        assert.ok(text.includes(`(command:journal.showScope?${encodeURIComponent(JSON.stringify(['acme']))})`), text);
        assert.deepStrictEqual([shown!.range!.start.character, shown!.range!.end.character], [6, 11]);
        assert.strictEqual(await hover.provideHover(document, new vscode.Position(2, 28)), undefined, 'a tag that names no scope');

        const outside = await vscode.workspace.openTextDocument({ language: 'markdown', content: 'see #acme' });
        assert.strictEqual(await hover.provideHover(outside, new vscode.Position(0, 6)), undefined);
    });
});
