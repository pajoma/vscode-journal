import * as assert from 'assert';
import moment = require('moment');

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as J from '../..';
import { TestLogger } from '../TestLogger';
import { suite, before, test } from 'mocha';
import { Ctrl } from '../../util';
import { fstat } from 'fs';
import path = require('path');

suite('Read templates from configuration', () => {
    let ctrl: J.Util.Ctrl;

    before(() => {
        let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
        ctrl = new J.Util.Ctrl(config);
        ctrl.logger = new TestLogger(true);

    });



    test.skip('Sync scopes', async () => {
        const scopes = ctrl.config.getScopes();
        assert.strictEqual(scopes.length, 3, "Invalid scope number");
    });

    test.skip('Test resolving note paths', async () => {
        const inPriv = new J.Model.Input(0); 
        inPriv.text = "#priv a note created in private scope";
        const pathPriv = await ctrl.parser.resolveNotePathForInput(inPriv); 
        const uriPriv = vscode.Uri.file(pathPriv); 


        const inWork = new J.Model.Input(0); 
        inWork.text = "#work a note created in work scope";
        const pathWork = await ctrl.parser.resolveNotePathForInput(inWork); 
        const uriWork = vscode.Uri.file(pathWork); 

        
        assert.ok(uriWork.path.match(/.*\/work\/.*/), "Wrong path to work note: "+uriWork.path);
        assert.ok(uriPriv.path.match(/\/private\//), "Wrong path to private note: "+uriPriv.path);

    }); 
    test('Create notes in different scopes', async () => {
        const scopes = ctrl.config.getScopes();
        assert.strictEqual(scopes.length, 3, "Invalid scope number");


        let a = ctrl.config.getScopes(); 

        // create a new note
        const privInput = await ctrl.parser.parseInput("#priv a note created in private scop");
        let privNotes = await new J.Provider.LoadNotes(privInput, ctrl);
        let privDoc: vscode.TextDocument = await  privNotes.load();
        privDoc = await ctrl.ui.saveDocument(privDoc); 
        const privUri = privDoc.uri; 

        

        const workInput = await ctrl.parser.parseInput("#work a note created in work scope");
        let workDoc: vscode.TextDocument = await new J.Provider.LoadNotes(workInput, ctrl).load();
        workDoc = await ctrl.ui.saveDocument(workDoc);
        const uriWork = workDoc.uri; 


        assert.ok(uriWork.path.match(/.*\/work\/.*/), "Wrong path to work note: "+uriWork.path);
        assert.ok(privUri.path.match(/\/private\//), "Wrong path to private note: "+privUri.path);
    }).timeout(50000);

});