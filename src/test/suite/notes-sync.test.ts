import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';


// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { Input, NoteInput } from '../../shared/model/index';
import { Container } from '../../app/index';
import { LoadNotes } from '../../features/notes/load-note';
import { TestLogger } from '../test-logger';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

suite('Test Notes Syncing', () => {

    test('Sync notes', async () => {

        const tmpBase = path.join(os.tmpdir(), `notes-sync-${Date.now()}`);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(tmpBase));

        try {
            // Own container with its own base and link sync: the extension's container may already be
            // activated (VS Code activates it on its own at some point) with a different journal.base.
            const ctrl = new Container(new FakeWorkspaceConfig({ base: tmpBase }), () => new TestLogger(false));
            ctrl.reader.onNotesInjected = (doc, date) => { ctrl.noteLinks.injectAttachmentLinks(doc, date); };

            // create today's entry
            const entry = await ctrl.reader.loadEntryForInput(new Input(0));
            assert.ok(entry, "Failed to open today's journal");

            // create a new note (stored in today's notes folder)
            let input = new NoteInput();
            input.text = "This is a sync test note " + Date.now();
            let notesDoc: vscode.TextDocument = await new LoadNotes(input, ctrl).load();
            let notesEditor = await ctrl.ui.showDocument(notesDoc);
            assert.ok(notesEditor, "Failed to open note");

            const noteFileName = notesDoc.uri.path.split('/').pop()!;
            let synced = false;
            let lastEntryText = '';

            for (let i = 0; i < 8; i++) {
                await new Promise(resolve => setTimeout(resolve, 500));

                // reopening the entry scans the notes folder and injects missing links
                const entryAgain = await ctrl.reader.loadEntryForInput(new Input(0));
                lastEntryText = entryAgain.getText();
                if (lastEntryText.includes(noteFileName)) {
                    synced = true;
                    break;
                }
            }

            assert.ok(synced, `Notes link wasn't injected for note '${noteFileName}'. Final entry content (first 500 chars): ${lastEntryText.substring(0, 500)}`);
        } finally {
            try { await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true }); } catch { /* ignore */ }
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        }

    }).timeout(10000)
        ;
});
