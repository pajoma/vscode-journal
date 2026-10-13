import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { Container } from '../../app/index';
import { resolveAnchor } from '../../features/navigation/navigation';
import { Configuration } from '../../shared/config/configuration';
import { ScopeRegistry } from 'journal-core';
import { Scope } from '../../shared/model/index';
import { FakeWorkspaceConfig } from '../fake-workspace-config';
import { TestLogger } from '../test-logger';

/** #254: one place decides what a scope is. */
suite('ScopeRegistry', () => {
    const root = path.join('/tmp', 'journal', 'scopes');
    const registry = (scopes: unknown, folders: string[] = []) => {
        const r = new ScopeRegistry(new FakeWorkspaceConfig({ scopes }), () => root);
        r.setFolders(folders);
        return r;
    };

    test('the first settings entry of a name wins', () => {
        const r = registry([
            { name: 'work', patterns: { entries: { path: '${base}/first' } } },
            { name: 'work', patterns: { entries: { path: '${base}/second' } } },
        ]);
        assert.strictEqual(r.get('work').pattern('entries', 'path'), '${base}/first');
        assert.deepStrictEqual(r.all().map(s => s.name), ['default', 'work'], 'duplicates are listed once');
    });

    test('a folder and a settings entry with the same name are one folder scope', () => {
        const r = registry([{ name: 'vera', base: '/elsewhere' }, { name: 'plan', patterns: { notes: { path: '${base}/plan' } } }], ['vera', 'plan', 'cage']);
        assert.deepStrictEqual(r.all().map(s => `${s.name}:${s.kind}`), ['default:default', 'vera:folder', 'plan:folder', 'cage:folder']);
        assert.strictEqual(r.get('vera').base, '/elsewhere', 'settings entry overrides the folder scope');
        assert.strictEqual(r.get('cage').notesFolder, path.join(root, 'cage'));
        assert.strictEqual(r.get('plan').notesFolder, undefined, 'an own notes path wins over the folder');
    });

    test('unknown, empty and "default" names resolve to the default scope', () => {
        const r = registry([{ name: 'work' }, { name: 'default', base: '/x' }]);
        for (const name of [undefined, '', 'default', 'nope']) {
            assert.strictEqual(r.get(name), Scope.DEFAULT, String(name));
        }
        assert.ok(!r.all().some(s => s.name === 'default' && !s.isDefault), '"default" cannot be configured');
    });

    test('an unknown scope name uses the journal patterns, like the default scope', () => {
        const config = new Configuration(new FakeWorkspaceConfig({
            patterns: { notes: { path: '${base}/n', file: 'note-${input}.${ext}' } },
            scopes: [{ name: 'work', patterns: { weeks: { path: '${base}/w' }, entries: { path: '${base}/work' } } }],
        }));
        const scoped = config.getNotesFilePattern(new Date(), 'x', 'nope');
        assert.strictEqual(scoped.template, 'note-${input}.${ext}', 'journal.patterns applies');
        assert.strictEqual(scoped.scope, 'default', 'the resolved template reports the default scope');
        assert.strictEqual(config.getWeekPathPattern(1, 2026, 'work').template, '${base}/work', 'a scope reads its entries path for weeks');
    });

    test('tolerates the old object default of journal.scopes and invalid folder names', () => {
        const r = registry({}, ['ok', 'not ok', '../x']);
        assert.deepStrictEqual(r.all().map(s => s.name), ['default', 'ok']);
    });
});

suite('Scoped templates', () => {
    test('scope template first, then journal.templates; the settings object is not modified', async () => {
        const global = { name: 'task', template: '- [ ] ${input}' };
        const scoped = { name: 'task', template: '- [ ] WORK ${input}' };
        const config = new Configuration(new FakeWorkspaceConfig({
            templates: [global, { name: 'memo' }],
            scopes: [{ name: 'work', templates: [scoped] }],
        }));
        assert.strictEqual((await config.getTaskInlineTemplate('work')).template, '- [ ] WORK ${input}');
        assert.strictEqual((await config.getTaskInlineTemplate()).template, '- [ ] ${input}');
        assert.ok(!('after' in global) && !('after' in scoped), 'loading must not write into the settings objects');
    });

    test('a configured template without text falls back to the default text', async () => {
        const config = new Configuration(new FakeWorkspaceConfig({ templates: [{ name: 'memo', after: '## Memos' }] }));
        const memo = await config.getMemoInlineTemplate();
        assert.strictEqual(memo.template, '- Memo: ${input}');
        assert.strictEqual(memo.after, '## Memos');
    });
});

suite('Navigation scope detection', () => {
    test('a configured scope without own base does not claim journal entries', async () => {
        const base = path.join('/tmp', 'journal-nav');
        const ctrl = new Container(new FakeWorkspaceConfig({
            base,
            scopes: [{ name: 'notbase' }, { name: 'client', base: path.join(base, 'client') }],
        }), () => new TestLogger(false));
        const editorFor = (file: string) => ({ document: { uri: vscode.Uri.file(file) } }) as unknown as vscode.TextEditor;

        const entry = await resolveAnchor(ctrl, editorFor(path.join(base, '2026', '10', '12.md')));
        assert.strictEqual(entry.scope, 'default', 'entries of the journal belong to the default scope');

        const scoped = await resolveAnchor(ctrl, editorFor(path.join(base, 'client', '2026', '10', '12.md')));
        assert.strictEqual(scoped.scope, 'client', 'a scope with own base is detected by path');
    });
});

