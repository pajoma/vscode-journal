import * as assert from 'assert';
import * as Path from 'path';
import { inferType } from '../../journal/paths';
import { JournalPageType } from '../../model/config';

suite('inferType — classification', () => {
    const EXT = '.md';

    suite('attachment', () => {
        test('extension mismatch → attachement', () => {
            const entry = Path.parse('/base/2026/05/2026-05-18.txt');
            assert.strictEqual(inferType(entry, EXT), JournalPageType.attachement);
        });

        test('no extension → attachement', () => {
            const entry = Path.parse('/base/2026/05/2026-05-18');
            assert.strictEqual(inferType(entry, EXT), JournalPageType.attachement);
        });
    });

    suite('entry', () => {
        test('digits-only name → entry', () => {
            const entry = Path.parse('/base/2026/05/20260518.md');
            assert.strictEqual(inferType(entry, EXT), JournalPageType.entry);
        });

        test('digits with hyphens → entry', () => {
            const entry = Path.parse('/base/2026/05/2026-05-18.md');
            assert.strictEqual(inferType(entry, EXT), JournalPageType.entry);
        });

        test('digits with underscores → entry', () => {
            const entry = Path.parse('/base/2026/05/2026_05_18.md');
            assert.strictEqual(inferType(entry, EXT), JournalPageType.entry);
        });

        // Pre-fix quirk: pipe (`|`) is a literal char in the character class,
        // so pipe-separated names currently classify as entry on non-Windows.
        // This test documents current behavior; it will be updated in Step 0b
        // when the regex is corrected.
        test('pipe-separated name → entry (pre-fix quirk)', () => {
            const entry = Path.parse('/base/2026/05/2026|05|18.md');
            assert.strictEqual(inferType(entry, EXT), JournalPageType.entry);
        });
    });

    suite('note', () => {
        test('alphanumeric name → note', () => {
            const entry = Path.parse('/base/2026/05/my-note.md');
            assert.strictEqual(inferType(entry, EXT), JournalPageType.note);
        });

        test('name with letters and digits → note', () => {
            const entry = Path.parse('/base/2026/05/meeting2026.md');
            assert.strictEqual(inferType(entry, EXT), JournalPageType.note);
        });
    });
});
