import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { LoadNotes } from '../../features/notes/load-note';
import { Input, NoteInput } from '../../shared/model/index';
import { Container } from '../../app/index';
import { TestLogger } from '../test-logger';
import { suite, before, test } from 'mocha';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

suite('Read templates from configuration', () => {
    let ctrl: Container;

    before(() => {
        ctrl = new Container(new FakeWorkspaceConfig({
            scopes: [
                {
                    name: 'work',
                    patterns: {
                        notes: {
                            path: '${base}/scopes/work',
                            file: '${month}-${day}-${input}.${ext}'
                        }
                    },
                    templates: []
                },
                {
                    name: 'priv',
                    patterns: {
                        notes: {
                            path: '${base}/scopes/private',
                            file: '${month}-${input}.${ext}'
                        }
                    },
                    templates: []
                }
            ]
        }), () => new TestLogger(false));
    });



    test('Sync scopes', async () => {
        const scopes = ctrl.config.getScopes();
        assert.strictEqual(scopes.length, 3, "Invalid scope number");
    });

    test('Test resolving note paths', async () => {
        const inPriv = new Input(0);
        inPriv.text = "#priv a note created in private scope";
        const pathPriv = await ctrl.parser.resolveNotePathForInput(inPriv);
        const uriPriv = vscode.Uri.file(pathPriv);


        const inWork = new Input(0);
        inWork.text = "#work a note created in work scope";
        const pathWork = await ctrl.parser.resolveNotePathForInput(inWork);
        const uriWork = vscode.Uri.file(pathWork);


        assert.ok(uriWork.path.match(/.*\/work\/.*/), "Wrong path to work note: " + uriWork.path);
        assert.ok(uriPriv.path.match(/\/private\//), "Wrong path to private note: " + uriPriv.path);

    });
    test('Create notes in different scopes', async () => {
        const scopes = ctrl.config.getScopes();
        assert.strictEqual(scopes.length, 3, "Invalid scope number");


        let a = ctrl.config.getScopes();

        // create a new note
        const privInput = await ctrl.parser.parseInput("#priv a note created in private scop");
        let privNotes = await new LoadNotes(privInput as NoteInput, ctrl);
        let privDoc: vscode.TextDocument = await privNotes.load();
        privDoc = await ctrl.ui.saveDocument(privDoc);
        const privUri = privDoc.uri;



        const workInput = await ctrl.parser.parseInput("#work a note created in work scope");
        let workDoc: vscode.TextDocument = await new LoadNotes(workInput as NoteInput, ctrl).load();
        workDoc = await ctrl.ui.saveDocument(workDoc);
        const uriWork = workDoc.uri;


        assert.ok(uriWork.path.match(/.*\/work\/.*/), "Wrong path to work note: " + uriWork.path);
        assert.ok(privUri.path.match(/\/private\//), "Wrong path to private note: " + privUri.path);
    }).timeout(50000);

});