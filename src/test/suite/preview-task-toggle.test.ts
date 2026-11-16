import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Container } from '../../app/index';
import { CompletedTaskActions } from '../../features/tasks/codeactions/for-completed-tasks';
import { OpenTaskActions } from '../../features/tasks/codeactions/for-open-tasks';
import { lineHash, TaskToggleHandler } from '../../features/tasks/preview-toggle';
import { TestLogger } from '../test-logger';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

/** A click on the box of a task in the preview completes or reopens it (vscode: link → URI handler). */
suite('Tasks toggled from the preview', () => {
    let tmpBase: string;
    let ctrl: Container;
    let handler: TaskToggleHandler;

    const write = async (file: string, text: string) => {
        const uri = vscode.Uri.file(path.join(tmpBase, file));
        await vscode.workspace.fs.writeFile(uri, Buffer.from(text));
        return uri;
    };
    const disk = async (uri: vscode.Uri) => new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    const link = (doc: vscode.Uri, line: number, text: string) =>
        vscode.Uri.parse(`vscode://pajoma.vscode-journal/task?${new URLSearchParams({ doc: doc.toString(), line: String(line), hash: lineHash(text) }).toString()}`);

    setup(() => {
        tmpBase = path.join(os.tmpdir(), `preview-toggle-${Date.now()}`);
        ctrl = new Container(new FakeWorkspaceConfig({ base: tmpBase }), () => new TestLogger(false));
        handler = new TaskToggleHandler(ctrl, [new OpenTaskActions(ctrl), new CompletedTaskActions(ctrl)]);
    });

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        try { await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true }); } catch { /* ignore */ }
    });

    test('completes an open task and reopens a done one, saved', async () => {
        const entry = await write('2026/11/16.md', '# Monday\n\n- [ ] call the bank\n- [x] write (done: 2026-11-16 09:00)\n');
        await handler.handleUri(link(entry, 2, '- [ ] call the bank'));
        assert.match(await disk(entry), /- \[x\] call the bank \(done: \d{4}-\d{2}-\d{2} \d{2}:\d{2}\)\n/);
        await handler.handleUri(link(entry, 3, '- [x] write (done: 2026-11-16 09:00)'));
        assert.match(await disk(entry), /\n- \[ \] write\n$/);
    });

    test('a line that changed, a moved task or a file outside the journal stay as they are', async () => {
        const entry = await write('2026/11/16.md', '# Monday\n\n- [ ] call the bank\n- [>] moved (moved: 2026-11-17)\n');
        await handler.handleUri(link(entry, 2, '- [ ] call the bank today'));
        await handler.handleUri(link(entry, 3, '- [>] moved (moved: 2026-11-17)'));
        assert.strictEqual(await disk(entry), '# Monday\n\n- [ ] call the bank\n- [>] moved (moved: 2026-11-17)\n');

        const generated = await write('.vscode/scopes/acme.md', '- [ ] a copy in the report\n');
        await handler.handleUri(link(generated, 0, '- [ ] a copy in the report'));
        assert.strictEqual(await disk(generated), '- [ ] a copy in the report\n');

        const outside = vscode.Uri.file(path.join(os.tmpdir(), `outside-${Date.now()}.md`));
        await vscode.workspace.fs.writeFile(outside, Buffer.from('- [ ] not mine\n'));
        await handler.handleUri(link(outside, 0, '- [ ] not mine'));
        assert.strictEqual(await disk(outside), '- [ ] not mine\n');
        await vscode.workspace.fs.delete(outside);
    });

    test('unsaved changes of the user stay unsaved', async () => {
        const entry = await write('2026/11/16.md', '# Monday\n\n- [ ] call the bank\n');
        const document = await vscode.workspace.openTextDocument(entry);
        const edit = new vscode.WorkspaceEdit();
        edit.insert(entry, new vscode.Position(0, 9), ' (draft)');
        await vscode.workspace.applyEdit(edit);
        await handler.handleUri(link(entry, 2, '- [ ] call the bank'));
        assert.ok(document.isDirty);
        assert.ok(document.getText().includes('- [x] call the bank (done: '), document.getText());
        assert.strictEqual(await disk(entry), '# Monday\n\n- [ ] call the bank\n');
    });
});
