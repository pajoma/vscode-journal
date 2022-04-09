import * as assert from 'assert';


// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as J from '../..';
import { NoteLoader } from '../../features';
import { TestLogger } from '../TestLogger';

suite('Test Notes Syncing', () => {

    test('Sync notes', async () => {
       

        let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
		let ctrl = new J.Util.Ctrl(config);
		ctrl.logger = new TestLogger(false); 
        let commands = new J.Extension.JournalCommands(ctrl);

        // create a new entry.. remember length

        let editor  = await commands.showEntry(0); 
        assert.ok(editor, "Failed to open today's journal");

        let originalLength  = editor.document.getText().length; 
        assert.ok(originalLength > 0, "Nothing in document"); 

        // create a new note
        let input = new J.Model.NoteInput(); 
        input.text = "This is a test note";
        let notesEditor = await new NoteLoader(input, ctrl).load();
        assert.ok(notesEditor, "Failed to open note");

        await new Promise( resolve => setTimeout(resolve, 2000));  

        let editorAgain  = await commands.showEntry(0); 
        assert.ok(editorAgain, "Failed to open today's journal");

        let newLength  = editorAgain.document.getText().length; 

        assert.ok(newLength > originalLength, "Notes link wasn't injected"); 

        // check length of new entry
	}).timeout(5000)
	; 
}); 