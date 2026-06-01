import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';


// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as J from '../..';
import { LoadNotes } from '../../features/entries/load-note';
import { TestLogger } from '../test-logger';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

suite('Test Notes Syncing', () => {

    test('Sync notes', async () => {

        const tmpBase = path.join(os.tmpdir(), `notes-sync-${Date.now()}`);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(tmpBase));

        const wsConfig = vscode.workspace.getConfiguration('journal');
        const originalBase = wsConfig.get<string>('base');
        await wsConfig.update('base', tmpBase, vscode.ConfigurationTarget.Workspace);

        try {
            let ctrl = new J.Util.Ctrl(new FakeWorkspaceConfig({ base: tmpBase }));
            ctrl.initServices(new TestLogger(false));

            // create a new entry.. remember length
            await vscode.commands.executeCommand("journal.today");
            let editor = vscode.window.activeTextEditor;
            assert.ok(editor, "Failed to open today's journal");

            // create a new note
            let input = new J.Model.NoteInput();
            input.text = "This is a sync test note " + Date.now();
            let notesDoc: vscode.TextDocument = await new LoadNotes(input, ctrl).load();
            let notesEditor = await ctrl.ui.showDocument(notesDoc);
            assert.ok(notesEditor, "Failed to open note");

            const noteFileName = notesDoc.uri.path.split('/').pop()!;
            let synced = false;
            let lastEditorText = '';

            for (let i = 0; i < 8; i++) {
                await new Promise(resolve => setTimeout(resolve, 500));

                await vscode.commands.executeCommand("journal.today");
                const editorAgain = vscode.window.activeTextEditor;
                assert.ok(editorAgain, "Failed to open today's journal");

                lastEditorText = editorAgain!.document.getText();
                if (lastEditorText.includes(noteFileName)) {
                    synced = true;
                    break;
                }
            }

            assert.ok(synced, `Notes link wasn't injected for note '${noteFileName}'. Final entry content (first 500 chars): ${lastEditorText.substring(0, 500)}`);
        } finally {
            await wsConfig.update('base', originalBase, vscode.ConfigurationTarget.Workspace);
            try { await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true }); } catch { /* ignore */ }
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        }

    }).timeout(10000)
        ;
});
