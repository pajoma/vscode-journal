import * as assert from 'assert';


// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as J from '../..';
import { LoadNotes } from '../../provider';
import { TestLogger } from '../test-logger';

suite('Test Notes Syncing', () => {

    test('Sync notes', async () => {


        let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
        let ctrl = new J.Util.Ctrl(config);
        ctrl.logger = new TestLogger(false);

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

    }).timeout(10000)
        ;
}); 