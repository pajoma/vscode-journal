import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Container } from '../../app/index';
import { IssueLinkProvider } from '../../features/issuelinks/issue-link-provider';
import { FakeWorkspaceConfig } from '../fake-workspace-config';
import { TestLogger } from '../test-logger';

const ISSUE_LINKS = {
    pida: 'https://github.com/owner/pida/issues/${id}',
    op: 'https://openproject.example.com/work_packages/${id}',
};

/** Issue links in the editor: Ctrl+click on `pida#23` opens the issue (#173). */
suite('Issue #173 — issue links', () => {
    let base: string;

    const container = (issueLinks: unknown) => new Container(new FakeWorkspaceConfig({ base, issueLinks }), () => new TestLogger(false));
    async function entry(text: string): Promise<vscode.TextDocument> {
        const file = path.join(base, '2026', '11', '09.md');
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(file)));
        await vscode.workspace.fs.writeFile(vscode.Uri.file(file), new TextEncoder().encode(text));
        return vscode.workspace.openTextDocument(file);
    }

    setup(async () => {
        base = path.join(os.tmpdir(), `issue173-${Date.now()}`);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(base));
    });

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        try { await vscode.workspace.fs.delete(vscode.Uri.file(base), { recursive: true }); } catch { /* ignore */ }
    });

    test('the link provider links issue references in journal files to the issue', async () => {
        const doc = await entry('# Monday\n\n- [ ] fix pida#23, see op#7 and `pida#1`\n');
        const links = new IssueLinkProvider(container(ISSUE_LINKS)).provideDocumentLinks(doc);
        assert.deepStrictEqual(links.map(link => doc.getText(link.range)), ['pida#23', 'op#7']);
        assert.deepStrictEqual(links.map(link => link.target!.toString(true)), [
            'https://github.com/owner/pida/issues/23',
            'https://openproject.example.com/work_packages/7',
        ]);
    });

    test('not in files outside the journal', async () => {
        const outside = await vscode.workspace.openTextDocument({ language: 'markdown', content: 'fix pida#23' });
        assert.deepStrictEqual(new IssueLinkProvider(container(ISSUE_LINKS)).provideDocumentLinks(outside), []);
    });

    test('a command: URL in the settings links nothing (Ctrl+click must not run commands)', async () => {
        const doc = await entry('fix pida#23 and op#7\n');
        const links = new IssueLinkProvider(container({ pida: 'command:workbench.action.terminal.new', op: ISSUE_LINKS.op })).provideDocumentLinks(doc);
        assert.deepStrictEqual(links.map(link => link.target!.scheme), ['https']);
    });

    test('a setting that is no object of prefixes and URLs links nothing', async () => {
        const doc = await entry('fix pida#23\n');
        for (const issueLinks of [['pida'], 'https://x/${id}', null, 42]) {
            const ctrl = container(issueLinks);
            assert.deepStrictEqual(ctrl.config.getIssueLinks(), {}, JSON.stringify(issueLinks));
            assert.deepStrictEqual(new IssueLinkProvider(ctrl).provideDocumentLinks(doc), [], JSON.stringify(issueLinks));
        }
    });
});
