import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { SearchJournalCommand } from '../../features/entries/commands/search-journal';
import { VscodeEditor } from '../../shared/editor/vscode-editor';
import { EditorSettings, SEARCH_DEFAULTS } from '../../shared/model/index';
import { TestLogger } from '../test-logger';
import { createMockCtrl } from './command-test-helpers';

/** The search command and opening a hit at its line (#300). */
suite('Issue #300 — search command and opening a hit', () => {

    test('with the search turned off the command says so and opens no search', async () => {
        let searched = false;
        const messages: string[] = [];
        const ctrl = createMockCtrl({
            config: { getSearchSettings: () => ({ ...SEARCH_DEFAULTS, enabled: false }) },
            ui: { search: async () => { searched = true; return undefined; } },
        });
        const original = Object.getOwnPropertyDescriptor(vscode.window, 'showInformationMessage');
        Object.defineProperty(vscode.window, 'showInformationMessage', {
            value: async (message: string) => { messages.push(message); return undefined; },
            configurable: true, writable: true,
        });
        try {
            await new SearchJournalCommand(ctrl).run();
        } finally {
            if (original) { Object.defineProperty(vscode.window, 'showInformationMessage', original); }
        }
        assert.strictEqual(searched, false);
        assert.strictEqual(messages.length, 1);
        assert.ok(messages[0].includes('journal.search.enabled'), messages[0]);
    });

    test('a hit opens with the cursor on its line', async () => {
        const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'journal-search-')), 'hit.md');
        fs.writeFileSync(file, Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n'));
        const settings = { isOpenInNewEditorGroup: () => false } as unknown as EditorSettings;
        try {
            await new VscodeEditor(settings, new TestLogger(false)).show(file, 25);
            const editor = vscode.window.activeTextEditor;
            assert.ok(editor, 'no editor opened');
            assert.strictEqual(editor.document.fileName, file);
            assert.strictEqual(editor.selection.active.line, 25);
        } finally {
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            fs.rmSync(path.dirname(file), { recursive: true, force: true });
        }
    });
});
