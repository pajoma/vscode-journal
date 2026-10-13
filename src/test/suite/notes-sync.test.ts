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
            ctrl.reader.onNotesInjected = (path, date) => { ctrl.noteLinks.injectAttachmentLinks(path, date); };

            // create today's entry
            const entry = await ctrl.reader.loadEntryForInput(new Input(0));
            assert.ok(entry, "Failed to open today's journal");

            // create a new note (stored in today's notes folder)
            let input = new NoteInput();
            input.text = "This is a sync test note " + Date.now();
            const note = await new LoadNotes(input, ctrl).load();
            await ctrl.editor.show(note);

            const noteFileName = vscode.Uri.file(note).path.split('/').pop()!;
            let synced = false;
            let lastEntryText = '';

            for (let i = 0; i < 8; i++) {
                await new Promise(resolve => setTimeout(resolve, 500));

                // reopening the entry scans the notes folder and injects missing links
                const entryAgain = await ctrl.reader.loadEntryForInput(new Input(0));
                lastEntryText = await ctrl.editor.getText(entryAgain);
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

    /** Opening an entry links the notes whose path names its day, never by modification time (#279). */
    suite('notes of the day by the date in their path (#279)', () => {
        let tmpBase: string;
        let ctrl: Container;
        const today = new Date();
        const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);

        const write = async (file: string, text: string) =>
            vscode.workspace.fs.writeFile(vscode.Uri.file(file), Buffer.from(text));
        const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

        setup(async () => {
            tmpBase = path.join(os.tmpdir(), `notes-by-path-${Date.now()}`);
            ctrl = new Container(new FakeWorkspaceConfig({ base: tmpBase }), () => new TestLogger(false));
        });

        teardown(async () => {
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            try { await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true }); } catch { /* ignore */ }
        });

        test('a note named with the day is linked; a note of another day, just edited, is not', async () => {
            // one flat notes folder: the old scan linked every note in it modified today
            ctrl = new Container(new FakeWorkspaceConfig({
                base: tmpBase,
                patterns: {
                    notes: { path: '${base}/notes', file: '${d:YYYY-MM-DD}_${input}.${ext}' },
                    entries: { path: '${base}/${year}/${month}', file: '${day}.${ext}' },
                },
            }), () => new TestLogger(false));
            const entry = await ctrl.reader.loadEntryForInput(new Input(0));
            // both written now: by modification time both would belong to today
            await write(path.join(tmpBase, 'notes', `${iso(today)}_Dropped_in.md`), '# Dropped in\n');
            await write(path.join(tmpBase, 'notes', `${iso(yesterday)}_Old_note.md`), '# Old note, edited today\n');

            await ctrl.noteLinks.injectAttachmentLinks(entry, today);

            const text = await ctrl.editor.getText(entry);
            assert.ok(text.includes(`${iso(today)}_Dropped_in.md`), `note of the day linked: ${text}`);
            assert.ok(!text.includes('Old_note.md'), `note of another day not linked: ${text}`);
        });

        test('a new note is linked when it is created, also where the notes pattern names no day', async () => {
            ctrl = new Container(new FakeWorkspaceConfig({
                base: tmpBase,
                patterns: { notes: { path: '${base}/notes', file: '${input}.${ext}' }, entries: { path: '${base}/${year}/${month}', file: '${day}.${ext}' } },
            }), () => new TestLogger(false));
            assert.strictEqual(ctrl.config.getNotesOfDay(today), undefined, 'the flat notes folder names no day');
            const linked = new Promise<void>(resolve => ctrl.events.onNoteCreated(() => resolve()));

            const input = new NoteInput();
            input.text = 'Flat note';
            const note = await new LoadNotes(input, ctrl).load();
            await linked;
            const entry = await ctrl.reader.loadEntryForInput(new Input(0));
            // link updates run one after another: this one runs after the container's, which linked the note
            await ctrl.noteLinks.linkNotes(entry, []);
            const text = await ctrl.editor.getText(entry);
            assert.ok(text.includes(path.basename(note)), `new note linked: ${text}`);
        });
    });
});
