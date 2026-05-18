import * as assert from 'assert';
import * as Path from 'path';
import { inferType, InferTypeContext } from '../../journal/paths';
import { JournalPageType } from '../../model/config';

suite('inferType — classification', () => {
    const ctx: InferTypeContext = { extension: '.md' };

    suite('attachment', () => {
        test('extension mismatch → attachement', () => {
            const entry = Path.parse('/base/2026/05/2026-05-18.txt');
            assert.strictEqual(inferType(entry, ctx), JournalPageType.attachement);
        });

        test('no extension → attachement', () => {
            const entry = Path.parse('/base/2026/05/2026-05-18');
            assert.strictEqual(inferType(entry, ctx), JournalPageType.attachement);
        });
    });

    suite('entry', () => {
        test('digits-only name → entry', () => {
            const entry = Path.parse('/base/2026/05/20260518.md');
            assert.strictEqual(inferType(entry, ctx), JournalPageType.entry);
        });

        test('digits with hyphens → entry', () => {
            const entry = Path.parse('/base/2026/05/2026-05-18.md');
            assert.strictEqual(inferType(entry, ctx), JournalPageType.entry);
        });

        test('digits with underscores → entry', () => {
            const entry = Path.parse('/base/2026/05/2026_05_18.md');
            assert.strictEqual(inferType(entry, ctx), JournalPageType.entry);
        });

        test('pipe-separated name → note (pipe not a separator)', () => {
            // Pipe was previously a literal in the character class; now correctly excluded.
            const entry = Path.parse('/base/2026/05/2026|05|18.md');
            assert.strictEqual(inferType(entry, ctx), JournalPageType.note);
        });
    });

    suite('note', () => {
        test('alphanumeric name → note', () => {
            const entry = Path.parse('/base/2026/05/my-note.md');
            assert.strictEqual(inferType(entry, ctx), JournalPageType.note);
        });

        test('name with letters and digits → note', () => {
            const entry = Path.parse('/base/2026/05/meeting2026.md');
            assert.strictEqual(inferType(entry, ctx), JournalPageType.note);
        });
    });
});
