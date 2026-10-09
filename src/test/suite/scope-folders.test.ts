import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Input, NoteInput } from '../../shared/model/index';
import { Container, LiveWorkspaceConfig } from '../../app/index';
import { LoadNotes } from '../../features/notes/load-note';
import { CreateScopeCommand } from '../../features/scopes/commands/create-scope';
import { refreshScopeFolders, watchScopeFolders } from '../../features/scopes/scope-folders';
import { TestLogger } from '../test-logger';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

suite('Scopes as folders', () => {
    let tmpBase: string;

    setup(async () => {
        tmpBase = path.join(os.tmpdir(), `scope-folders-${Date.now()}`);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(tmpBase, 'scopes', 'vera')));
    });

    teardown(async () => {
        try { await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true }); } catch { /* ignore */ }
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    function container(settings: Record<string, unknown> = {}): Container {
        return new Container(new FakeWorkspaceConfig({ base: tmpBase, ...settings }), () => new TestLogger(false));
    }

    test('folders below the scope root are scopes, next to configured ones', async () => {
        const ctrl = container({ scopes: [{ name: 'work', patterns: { notes: { path: '${base}/work', file: '${input}.${ext}' } } }] });
        assert.deepStrictEqual(await refreshScopeFolders(ctrl), ['vera']);
        assert.deepStrictEqual(ctrl.config.getScopes(), ['default', 'work', 'vera']);
        assert.strictEqual(ctrl.config.getScopeFolderPath('vera'), path.join(tmpBase, 'scopes', 'vera'));
        assert.strictEqual(ctrl.config.getScopeFolderPath('work'), undefined);
    });

    test('scopeRoot can be configured, relative to the base', async () => {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(tmpBase, 'projects', 'cage')));
        const ctrl = container({ scopeRoot: 'projects' });
        assert.deepStrictEqual(await refreshScopeFolders(ctrl), ['cage']);
    });

    test('notes of a folder scope are stored in its folder; tags may contain "-"', async () => {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(tmpBase, 'scopes', 'client-a')));
        const ctrl = container();
        await refreshScopeFolders(ctrl);

        const input = new Input(0);
        input.text = '#vera Konzept Schnittstelle #draft';
        assert.strictEqual(await ctrl.parser.resolveNotePathForInput(input), path.join(tmpBase, 'scopes', 'vera', 'Konzept_Schnittstelle.md'));
        assert.deepStrictEqual(input.tags, ['#vera', '#draft']);

        const dashed = new Input(0);
        dashed.text = '#client-a Kickoff';
        assert.strictEqual(await ctrl.parser.resolveNotePathForInput(dashed), path.join(tmpBase, 'scopes', 'client-a', 'Kickoff.md'));
    });

    test('Create Scope creates the folder and registers the scope', async () => {
        const ctrl = container();
        await refreshScopeFolders(ctrl);
        const cmd = new (CreateScopeCommand as any)(ctrl) as CreateScopeCommand;

        const folder = await cmd.execute('#proj-a');
        assert.strictEqual(folder, path.join(tmpBase, 'scopes', 'proj-a'));
        await vscode.workspace.fs.stat(vscode.Uri.file(path.join(folder!, '.gitkeep')));
        assert.ok(ctrl.config.getScopes().includes('proj-a'));

        assert.ok(cmd.validate('vera'), 'existing scope must be rejected');
        assert.ok(cmd.validate('a b'), 'spaces must be rejected');
        assert.ok(cmd.validate('../x'), 'path segments must be rejected');
        assert.strictEqual(cmd.validate('new_scope'), undefined);
    });

    test('a new note in a folder scope is linked from the main journal entry', async () => {
        const ctrl = container();
        await refreshScopeFolders(ctrl);
        // no manual wiring: the container links notes announced via the noteCreated event

        const input = await ctrl.parser.parseInput('#vera Scoped link test') as NoteInput;
        const note = await new LoadNotes(input, ctrl).load();
        assert.ok(note.uri.fsPath.startsWith(path.join(tmpBase, 'scopes', 'vera')), note.uri.fsPath);

        const entry = await ctrl.reader.loadEntryForInput(new Input(0));
        assert.ok(entry.uri.fsPath.startsWith(tmpBase) && !entry.uri.fsPath.includes(`${path.sep}scopes${path.sep}`),
            'link target entry must be the main journal entry: ' + entry.uri.fsPath);

        let text = '';
        for (let i = 0; i < 10 && !text.includes('Scoped_link_test.md'); i++) {
            await new Promise(resolve => setTimeout(resolve, 300));
            text = entry.getText();
        }
        assert.match(text, /\(\.\.\/\.\.\/scopes\/vera\/Scoped_link_test\.md\)/);
    }).timeout(20000);

    test('a changed scope root is rescanned and watched', async () => {
        const settings = vscode.workspace.getConfiguration('journal');
        const original = {
            base: settings.inspect<string>('base')?.workspaceValue,
            scopeRoot: settings.inspect<string>('scopeRoot')?.workspaceValue,
        };
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(tmpBase, 'projects', 'cage')));
        await settings.update('base', tmpBase, vscode.ConfigurationTarget.Workspace);
        await settings.update('scopeRoot', undefined, vscode.ConfigurationTarget.Workspace);
        const ctrl = new Container(new LiveWorkspaceConfig(), () => new TestLogger(false));
        await refreshScopeFolders(ctrl);
        const watcher = watchScopeFolders(ctrl);
        try {
            assert.deepStrictEqual(ctrl.config.getScopes(), ['default', 'vera']);
            await settings.update('scopeRoot', 'projects', vscode.ConfigurationTarget.Workspace);
            for (let i = 0; i < 20 && !ctrl.config.getScopes().includes('cage'); i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            assert.deepStrictEqual(ctrl.config.getScopes(), ['default', 'cage']);
        } finally {
            watcher.dispose();
            await settings.update('scopeRoot', original.scopeRoot, vscode.ConfigurationTarget.Workspace);
            await settings.update('base', original.base, vscode.ConfigurationTarget.Workspace);
        }
    }).timeout(10000);

    test('scopeRoot supports the same variables as journal.base', () => {
        const ctrl = container({ scopeRoot: '${homeDir}/journal-scopes' });
        assert.strictEqual(ctrl.config.getScopeRoot(), path.join(os.homedir(), 'journal-scopes'));
    });
});

