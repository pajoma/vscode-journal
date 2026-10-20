import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { dayWikiTarget } from 'journal-core';
import { Container } from '../../app/index';
import { SyncNoteLinks } from '../../features/notes/sync-note-links';
import { OpenWikiLinkCommand } from '../../features/wikilinks/commands/open-wiki-link';
import { WikiCompletionProvider } from '../../features/wikilinks/wiki-completion';
import { WikiIndex } from '../../features/wikilinks/wiki-index';
import { WikiLinkProvider } from '../../features/wikilinks/wiki-link-provider';
import { fileExists } from '../../shared/index';
import { FakeWorkspaceConfig } from '../fake-workspace-config';
import { TestLogger } from '../test-logger';

const PATTERNS = {
    entries: { path: '${base}/${year}/${month}', file: '${year}-${month}-${day}.${ext}' },
    notes: { path: '${base}/${year}/${month}/${day}', file: '${input}.${ext}' },
};

/** Wiki links in the editor: Ctrl+click, completion, link sync (#92). */
suite('Issue #92 — wiki links', () => {
    let base: string;
    let ctrl: Container;
    let index: WikiIndex;

    const at = (...parts: string[]) => path.join(base, ...parts);
    async function write(file: string, text = '# entry\n'): Promise<string> {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(at(file))));
        await vscode.workspace.fs.writeFile(vscode.Uri.file(at(file)), new TextEncoder().encode(text));
        return at(file);
    }
    const open = () => new (OpenWikiLinkCommand as any)(ctrl, index) as OpenWikiLinkCommand;

    setup(async () => {
        base = path.join(os.tmpdir(), `issue92-${Date.now()}`);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(base));
        ctrl = new Container(new FakeWorkspaceConfig({ base, patterns: PATTERNS }), () => new TestLogger(false));
        index = new WikiIndex(ctrl);
    });

    teardown(async () => {
        index.dispose();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        try { await vscode.workspace.fs.delete(vscode.Uri.file(base), { recursive: true }); } catch { /* ignore */ }
    });

    test('the link provider makes [[…]] in journal files clickable, not elsewhere', async () => {
        const entry = await write('2026/10/2026-10-20.md', '# Tuesday\n\nsee [[2026-10-19]] and [[Workshop Notes|the workshop]]\n');
        const doc = await vscode.workspace.openTextDocument(entry);
        const links = new WikiLinkProvider(ctrl).provideDocumentLinks(doc);
        assert.deepStrictEqual(links.map(link => doc.getText(link.range)), ['[[2026-10-19]]', '[[Workshop Notes|the workshop]]']);
        assert.ok(links[0].target!.toString(true).startsWith('command:journal.openWikiLink?'));
        assert.deepStrictEqual(JSON.parse(decodeURIComponent(links[1].target!.query)), ['Workshop Notes', entry]);

        const outside = await vscode.workspace.openTextDocument({ language: 'markdown', content: '[[2026-10-19]]' });
        assert.deepStrictEqual(new WikiLinkProvider(ctrl).provideDocumentLinks(outside), []);
    });

    test('Ctrl+click on a day opens its entry, also in an earlier layout, and creates a missing one', async () => {
        const old = await write('2026/09/30.md');
        assert.strictEqual(await open().execute('2026-09-30'), old);
        assert.strictEqual(await open().execute('2026-10-21'), at('2026', '10', '2026-10-21.md'));
        assert.ok(await fileExists(ctrl.fs, at('2026', '10', '2026-10-21.md')));
    });

    test('Ctrl+click on a note opens it by title; a missing note is created in its scope', async () => {
        const workshop = await write('2026/10/20/Workshop_Notes.md', '# Workshop Notes\n');
        assert.strictEqual(await open().execute('workshop notes'), workshop);

        await vscode.workspace.fs.createDirectory(vscode.Uri.file(at('scopes', 'work')));
        ctrl.config.setScopeFolders(['work']);
        const created = await open().execute('#work Konzept');
        assert.strictEqual(created, at('scopes', 'work', 'Konzept.md'));
        assert.ok(await fileExists(ctrl.fs, created!));
    });

    test('a relative date in a file is not resolved and creates no note', async () => {
        const window = vscode.window as any;
        const original = window.showInformationMessage;
        const messages: string[] = [];
        window.showInformationMessage = async (message: string) => { messages.push(message); return undefined; };
        try {
            assert.strictEqual(await open().execute('yesterday'), undefined);
            assert.ok(messages[0].includes('relative date'), messages.join());
            assert.ok(!(await fileExists(ctrl.fs, at('yesterday.md'))));
        } finally {
            window.showInformationMessage = original;
        }
    });

    test('completion after [[: relative dates become the day, entries and notes with unique targets', async () => {
        await write('2026/10/2026-10-19.md');
        await write('2026/10/20/Minutes.md');
        await write('2026/10/27/Minutes.md');
        await write('2026/10/20/Workshop_Notes.md');
        const entry = await write('2026/10/2026-10-28.md', '# Wednesday\n\n[[yesterday\n[[Work]]\n');
        const doc = await vscode.workspace.openTextDocument(entry);
        const provider = new WikiCompletionProvider(ctrl, index);

        const items = (await provider.provideCompletionItems(doc, new vscode.Position(2, 11)))!;
        const yesterday = dayWikiTarget(new Date(Date.now() - 24 * 60 * 60 * 1000));
        assert.strictEqual(items[0].insertText, `${yesterday}]]`, 'the relative date first, with the closing brackets');
        const insert = (label: string) => items.filter(item => (item.label as vscode.CompletionItemLabel).label === label).map(item => item.insertText);
        assert.deepStrictEqual(insert('2026-10-19'), ['2026-10-19]]']);
        assert.deepStrictEqual(insert('Minutes').sort(), ['20/Minutes]]', '27/Minutes]]']);
        assert.deepStrictEqual(insert('Workshop Notes'), ['Workshop Notes]]']);

        const inside = (await provider.provideCompletionItems(doc, new vscode.Position(3, 6)))!;
        assert.ok(inside.every(item => !String(item.insertText).endsWith(']]')), 'no second ]]');
        assert.strictEqual(await provider.provideCompletionItems(doc, new vscode.Position(0, 3)), undefined, 'not after [[');
    });

    test('the markdown preview renders wiki links as links, through VS Code\'s markdown engine', async function () {
        this.timeout(20000);
        // the extension under test renders with its own settings: point its journal to this test's folder
        const settings = vscode.workspace.getConfiguration('journal');
        await settings.update('base', base, vscode.ConfigurationTarget.Workspace);
        try {
            await write('2026/10/20/Konzept.md', '# Konzept\n');
            // the extension renders with the default patterns (only journal.base is set): the entry is 2026/10/20.md
            const entry = await write('2026/10/20.md', '# Tuesday\n\nsee [[Konzept]] and [[2026-10-20|today]] and [[Nothing]]\n');
            const doc = await vscode.workspace.openTextDocument(entry);
            // the first rendering starts the scan of the journal; the links appear once it is done
            let html = '';
            for (let i = 0; i < 40 && !html.includes('journal-wiki-link'); i++) {
                html = await vscode.commands.executeCommand<string>('markdown.api.render', doc);
                await new Promise(resolve => setTimeout(resolve, 250));
            }
            const href = (file: string) => vscode.Uri.file(at(...file.split('/'))).toString();
            assert.ok(html.includes(`href="${href('2026/10/20/Konzept.md')}"`), html);
            assert.ok(html.includes(`title="2026-10-20" data-href="${href('2026/10/20.md')}">today</a>`), 'a label: ' + html);
            assert.ok(html.includes('[[Nothing]]'), 'a target that names no file stays as written');
        } finally {
            await settings.update('base', undefined, vscode.ConfigurationTarget.Workspace);
        }
    });

    test('the link sync does not link a note again that a wiki link names', async () => {
        await write('2026/10/20/Workshop_Notes.md', '# Workshop Notes\n');
        await write('2026/10/20/Konzept.md', '# Konzept\n');
        const entry = await write('2026/10/2026-10-20.md', '# Tuesday\n\n## Notes\n\nsee [[workshop notes]]\n');
        await new SyncNoteLinks(ctrl).injectAttachmentLinks(entry, new Date(2026, 9, 20));
        const text = new TextDecoder().decode(await ctrl.fs.readFile(entry));
        assert.ok(text.includes('(20/Konzept.md)'), text);
        assert.ok(!text.includes('Workshop_Notes.md'), text);
    });
});
