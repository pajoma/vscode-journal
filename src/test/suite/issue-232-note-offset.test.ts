import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Input, NoteInput } from '../../shared/model/index';
import { Container } from '../../app/index';
import { LoadNotes } from '../../features/notes/load-note';
import { TestLogger } from '../test-logger';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

suite('Issue #232 — Note linked to specific day via temporal offset', () => {

    let tmpBase: string;
    let ctrl: Container;
    let logger: TestLogger;

    setup(async () => {
        tmpBase = path.join(os.tmpdir(), `issue232-${Date.now()}`);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(tmpBase));
        logger = new TestLogger(false);
        ctrl = new Container(new FakeWorkspaceConfig({ base: tmpBase }), () => logger);
    });

    teardown(async () => {
        try { await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true }); } catch { /* ignore */ }
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    test('offset=0 (default) links note to today', async () => {
        const capturedOffsets: number[] = [];
        const orig = ctrl.reader.loadEntryForInput.bind(ctrl.reader);
        (ctrl.reader as any).loadEntryForInput = async (input: Input) => {
            capturedOffsets.push(input.offset);
            return orig(input);
        };

        const input = new Input(0);
        input.text = 'TodayNote';
        await new LoadNotes(input as NoteInput, ctrl).load();

        assert.ok(capturedOffsets.some(o => o === 0), `expected offset 0, got ${JSON.stringify(capturedOffsets)}`);
        assert.strictEqual(logger.errors.length, 0, `errors: ${JSON.stringify(logger.errors)}`);
    });

    test('offset=+2 links note to day-after-tomorrow', async () => {
        const capturedOffsets: number[] = [];
        const orig = ctrl.reader.loadEntryForInput.bind(ctrl.reader);
        (ctrl.reader as any).loadEntryForInput = async (input: Input) => {
            capturedOffsets.push(input.offset);
            return orig(input);
        };

        const input = new Input(2);
        input.text = 'FutureNote';
        await new LoadNotes(input as NoteInput, ctrl).load();

        assert.ok(capturedOffsets.some(o => o === 2), `expected offset 2, got ${JSON.stringify(capturedOffsets)}`);
        assert.strictEqual(logger.errors.length, 0, `errors: ${JSON.stringify(logger.errors)}`);
    });

    test('offset=-1 links note to yesterday', async () => {
        const capturedOffsets: number[] = [];
        const orig = ctrl.reader.loadEntryForInput.bind(ctrl.reader);
        (ctrl.reader as any).loadEntryForInput = async (input: Input) => {
            capturedOffsets.push(input.offset);
            return orig(input);
        };

        const input = new Input(-1);
        input.text = 'YesterdayNote';
        await new LoadNotes(input as NoteInput, ctrl).load();

        assert.ok(capturedOffsets.some(o => o === -1), `expected offset -1, got ${JSON.stringify(capturedOffsets)}`);
        assert.strictEqual(logger.errors.length, 0, `errors: ${JSON.stringify(logger.errors)}`);
    });

    test('resolveNotePathForInput uses generateDate() — path shifts with offset', async () => {
        const today = new Date();
        const future = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2);

        const inputToday = new Input(0);
        inputToday.text = 'SameNote';
        const inputFuture = new Input(2);
        inputFuture.text = 'SameNote';

        const pathToday = await ctrl.parser.resolveNotePathForInput(inputToday);
        const pathFuture = await ctrl.parser.resolveNotePathForInput(inputFuture);

        assert.notStrictEqual(pathToday, pathFuture, 'note paths should differ when offset differs');
        assert.ok(pathFuture.includes(String(future.getDate()).padStart(2, '0')) ||
                  pathFuture.includes(String(future.getMonth() + 1).padStart(2, '0')),
                  `future path should contain day or month of day+2: ${pathFuture}`);
    });
});
