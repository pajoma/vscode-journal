import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Container } from '../../app/index';
import { SetKeyActions, SetKeyCommand } from '../../features/tasks/codeactions/set-key';
import { refreshScopeFolders } from '../../features/scopes/scope-folders';
import { TestLogger } from '../test-logger';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

/** Keys of tasks and "Set Identifier" (docs/specs/2026-11-13-scopes-keys-plans.md). */
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
        await write('2026/11/12.md', '# Thursday\n\n- [ ] +acme:4 write guide\n- [x] :2 call the bank\n');
        await write('scopes/acme/Plan.md', '# Plan\n\n- [ ] +acme:9 interview\n');
        ctrl = new Container(new FakeWorkspaceConfig({ base: tmpBase }), () => new TestLogger(false));
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

    test('Set Identifier is offered on journal tasks without key, not on keyed or moved ones', async () => {
        const uri = await write('2026/11/13.md', '# Friday\n\n- [ ] call +Acme\n- [ ] +acme:4 keyed\n- [>] moved (moved: 2026-11-14)\n- [x] done without key\n');
        const document = await vscode.workspace.openTextDocument(uri);
        const actions = new SetKeyActions(ctrl);
        const offered = (line: number) => actions.provideCodeActions(document, new vscode.Range(line, 0, line, 0)).length > 0;
        assert.deepStrictEqual([0, 2, 3, 4, 5].map(offered), [false, true, false, false, true]);

        const outside = await vscode.workspace.openTextDocument({ language: 'markdown', content: '- [ ] not in the journal' });
        assert.strictEqual(actions.provideCodeActions(outside, new vscode.Range(0, 0, 0, 0)).length, 0);
    });

    test('Set Identifier gives the key of the named scope in its place, else the default key in front', async () => {
        const uri = await write('2026/11/13.md', '# Friday\n\n- [ ] call +Acme today\n  - [ ] call the bank\n');
        const command = new (SetKeyCommand as any)(ctrl) as SetKeyCommand;

        assert.strictEqual(await command.execute(uri, 2), '+acme:10');
        assert.strictEqual(await command.execute(uri, 3), ':3');
        assert.strictEqual(await command.execute(uri, 2), undefined, 'a keyed task keeps its key');

        const document = await vscode.workspace.openTextDocument(uri);
        assert.deepStrictEqual([document.lineAt(2).text, document.lineAt(3).text], ['- [ ] call +acme:10 today', '  - [ ] :3 call the bank']);
        assert.deepStrictEqual(await ctrl.keys.next('acme'), { scope: 'acme', number: 11 }, 'the unsaved key counts');
    });
});
