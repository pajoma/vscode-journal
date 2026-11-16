import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Container } from '../../app/index';
import { CreatePlanCommand } from '../../features/scopes/commands/create-plan';
import { CreateScopeAction } from '../../features/scopes/create-scope-action';
import { refreshScopeFolders } from '../../features/scopes/scope-folders';
import { TestLogger } from '../test-logger';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

/** Getting into scopes: from a tag to a scope, from a scope to its plan. */
suite('Scope onboarding', () => {
    let tmpBase: string;
    let ctrl: Container;

    const write = async (file: string, text: string) => {
        const uri = vscode.Uri.file(path.join(tmpBase, file));
        await vscode.workspace.fs.writeFile(uri, Buffer.from(text));
        return uri;
    };

    setup(async () => {
        tmpBase = path.join(os.tmpdir(), `scope-onboarding-${Date.now()}`);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(tmpBase, 'scopes', 'acme')));
        ctrl = new Container(new FakeWorkspaceConfig({ base: tmpBase }), () => new TestLogger(false));
        await refreshScopeFolders(ctrl);
    });

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        try { await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true }); } catch { /* ignore */ }
    });

    test('a tag that names no scope offers to create one, at the cursor only', async () => {
        const document = await vscode.workspace.openTextDocument(await write('2026/11/16.md', '- [ ] call #Web and #acme about #2nd, #default at 10:30\n'));
        const actions = new CreateScopeAction(ctrl);
        const offered = (character: number) => actions.provideCodeActions(document, new vscode.Range(0, character, 0, character))
            .map(action => [action.title, ...(action.command?.arguments ?? [])]);
        assert.deepStrictEqual(offered(13), [['Create scope #web', 'web']], 'on #Web');
        assert.deepStrictEqual(offered(24), [], 'on #acme, a scope');
        assert.deepStrictEqual(offered(2), [], 'not on the tag');
        assert.deepStrictEqual(offered(36), [], '#2nd is no slug');
        assert.deepStrictEqual(offered(43), [], '#default is reserved');

        const outside = await vscode.workspace.openTextDocument({ language: 'markdown', content: 'see #web' });
        assert.deepStrictEqual(actions.provideCodeActions(outside, new vscode.Range(0, 6, 0, 6)), []);
    });

    test('Create Plan writes the plan of the scope from the template and opens it; an existing plan is opened', async () => {
        const command = new (CreatePlanCommand as any)(ctrl) as CreatePlanCommand;
        const plan = await command.execute('acme');
        assert.strictEqual(plan, path.join(tmpBase, 'scopes', 'acme', 'Plan.md'));
        const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.file(plan!)));
        assert.strictEqual(text, '# Plan #acme\n\n## Next\n\n- [ ] \n');
        assert.strictEqual(vscode.window.activeTextEditor?.document.uri.fsPath, plan);
        assert.deepStrictEqual(vscode.window.activeTextEditor?.selection.active, new vscode.Position(4, 6));

        await vscode.workspace.fs.writeFile(vscode.Uri.file(plan!), Buffer.from('# Mine\n'));
        assert.strictEqual(await command.execute('acme'), plan);
        assert.strictEqual(new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.file(plan!))), '# Mine\n', 'not overwritten');
        assert.strictEqual(await command.execute('nope'), undefined);
    });
});
