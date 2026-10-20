import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { firstDayOfWeek, weekOf } from 'journal-core';
import { Container } from '../../app/index';
import { Inject } from '../../features/entries/inject';
import { LoadNotes } from '../../features/notes/load-note';
import { matchInput } from '../../features/smart-input/match-input';
import { Parser } from '../../features/smart-input/parser';
import { PickerContent } from '../../features/smart-input/picker-content';
import { Configuration } from '../../shared/config/configuration';
import { fileExists } from '../../shared/index';
import { FakeWorkspaceConfig } from '../fake-workspace-config';
import { InMemoryFileSystem } from '../in-memory-fs';
import { TestLogger } from '../test-logger';
import { createMockCtrl } from './command-test-helpers';
import { PageTexts } from '../../shared/journal/page-texts';

/** "note mon Review" creates a note for Monday, linked from Monday's entry, not from today's (#149). */
suite('Issue #149 — a note for a given day or week', () => {

    suite('smart input', () => {
        test('"note" before or after the date creates a note for that day', () => {
            const monday = matchInput('mon x', 'en').offset;
            for (const value of ['note mon Review', 'mon note Review', 'NOTE mon Review']) {
                const input = matchInput(value, 'en');
                assert.strictEqual(input.kind, 'note', value);
                assert.strictEqual(input.offset, monday, `${value}: Monday`);
                assert.strictEqual(input.text, 'Review', `${value}: the title without keyword and date`);
            }
        });

        test('"note w23" creates a note for week 23', () => {
            const input = matchInput('note w23 Konzept', 'en');
            assert.strictEqual(input.kind, 'note');
            assert.strictEqual(input.week, 23);
            assert.strictEqual(input.text, 'Konzept');
        });

        test('a note needs a title', () => {
            assert.throws(() => matchInput('note mon', 'en'), /No title found for note/);
        });

        test('"note" only as a word of its own: "Note: …" and "notes …" stay memos', () => {
            assert.strictEqual(matchInput('Note: call Bob', 'en').kind, 'memo');
            assert.strictEqual(matchInput('notes from the call', 'en').kind, 'memo');
        });
    });

    suite('parser', () => {
        const base = path.join('/tmp', 'journal-149');
        const parser = (settings: Record<string, unknown> = {}) => {
            const config = new Configuration(new FakeWorkspaceConfig({ base, ...settings }));
            return { config, parser: new Parser(config, new TestLogger(false)) };
        };

        test('a title in the note picker is not searched for a date', () => {
            const input = parser().parser.noteInput('mon Review');
            assert.strictEqual(input.kind, 'note');
            assert.strictEqual(input.text, 'mon Review');
            assert.strictEqual(input.offset, 0, 'today');
        });

        test('the New Note dialog reads a leading day, but "note" and "task" stay in the title', () => {
            const p = parser().parser;
            const monday = matchInput('mon x', 'en').offset;
            const dated = p.noteInput('mon note Review', { leadingDate: true });
            assert.strictEqual(dated.offset, monday, 'Monday');
            assert.strictEqual(dated.text, 'note Review');
            for (const title of ['Note taking tips', 'Task list cleanup']) {
                const input = p.noteInput(title, { leadingDate: true });
                assert.strictEqual(input.text, title, 'the whole title');
                assert.strictEqual(input.offset, 0, `${title}: today`);
            }
        });

        test('the header of a note for a week has the week\'s first day, not an invalid date', async () => {
            const { config, parser: p } = parser({ entryGranularity: 'weekly', templates: [{ name: 'note', template: '# ${input} ${d:YYYY-MM-DD}' }] });
            const input = p.noteInput('Review');
            const first = firstDayOfWeek(input.week, input.weekYear, config.getLocale());
            const day = [first.getFullYear(), first.getMonth() + 1, first.getDate()].map(n => String(n).padStart(2, '0')).join('-');
            const header = await new Inject(config, new TestLogger(false), createMockCtrl().editor).formatNote(input);
            assert.strictEqual(header.trimEnd(), `# Review ${day}`);
        });

        test('with weekly entries, a note from the note picker is for the current week', () => {
            const { config, parser: p } = parser({ entryGranularity: 'weekly' });
            const input = p.noteInput('Review');
            assert.strictEqual(input.week, weekOf(new Date(), config.getLocale()).week);
        });

        test('a note for a week lies in the notes folder of the week\'s first day (daily entries)', async () => {
            const { config, parser: p } = parser();
            const input = matchInput('note w23 Konzept', 'en');
            const first = firstDayOfWeek(23, input.weekYear, config.getLocale());
            const expected = path.join(config.getResolvedNotesPath(first).value, 'Konzept.md');
            assert.strictEqual(await p.resolveNotePathForInput(input), expected);
        });

        test('a note for a week lies in that week\'s notes folder (weekly entries)', async () => {
            const { parser: p } = parser({ entryGranularity: 'weekly' });
            const input = matchInput('note w23 Konzept', 'en', 'weekly');
            assert.strictEqual(await p.resolveNotePathForInput(input), path.join(base, String(input.weekYear), 'w23', 'Konzept.md'));
        });

        test('the picker row says where the note is linked from', async () => {
            const { config, parser: p } = parser();
            const content = new PickerContent(config, p, new PageTexts(new InMemoryFileSystem()));
            assert.ok((await content.inputItem('note mon Review')).detail!.startsWith('Create note linked from entry'));
            assert.strictEqual((await content.inputItem('note w23 Konzept')).detail, 'Create note linked from week 23');
        });
    });

    suite('creating the note', () => {
        let tmpBase: string;
        let ctrl: Container;

        setup(async () => {
            tmpBase = path.join(os.tmpdir(), `issue149-${Date.now()}`);
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(tmpBase));
            ctrl = new Container(new FakeWorkspaceConfig({ base: tmpBase }), () => new TestLogger(false));
        });

        teardown(async () => {
            await vscode.workspace.fs.delete(vscode.Uri.file(tmpBase), { recursive: true, useTrash: false });
        });

        /** Creates the note of the smart input and returns it with the entry that links it. */
        async function createNote(value: string): Promise<{ note: string; entry: string }> {
            const created = new Promise<string>(resolve => ctrl.events.onNoteCreated(({ entry }) => resolve(entry)));
            const note = await new LoadNotes(await ctrl.parser.parseInput(value), ctrl).load();
            const entry = await created;
            // link updates run one after another: this one runs after the container's, which linked the note
            await ctrl.noteLinks.linkNotes(entry, []);
            return { note, entry };
        }

        function todaysEntry(): string {
            const today = new Date();
            return path.join(ctrl.config.getResolvedEntryPath(today).value, ctrl.config.getEntryFilePattern(today).value);
        }

        test('"note mon Review" is linked from Monday\'s entry', async () => {
            const monday = matchInput('mon x', 'en');
            const { note, entry } = await createNote('note mon Review');
            assert.strictEqual(entry, await ctrl.reader.loadEntryForDay(monday.generateDate()), 'Monday\'s entry');
            assert.ok((await ctrl.editor.getText(entry)).includes(path.basename(note)), 'linked from it');
            if (monday.offset !== 0) {
                assert.ok(!(await fileExists(ctrl.fs, todaysEntry())), 'no entry for today was created');
            }
        });

        test('"note w23 Konzept" is linked from the entry of week 23, no daily entry is created', async () => {
            const { note, entry } = await createNote('note w23 Konzept');
            const year = matchInput('w23', 'en').weekYear;
            assert.strictEqual(entry, await ctrl.reader.loadEntryForWeek(23, year), 'the weekly entry');
            assert.ok((await ctrl.editor.getText(entry)).includes(path.basename(note)), 'linked from it');
            assert.ok(!(await fileExists(ctrl.fs, todaysEntry())), 'no entry for today was created');
        });
    });
});
