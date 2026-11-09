import * as assert from 'assert';
import { matchPathTemplate, matchTemplateInput } from '../../shared/paths';

const ENTRIES = '${base}/${year}/${month}/${day}.${ext}';

/** The drive letter of a Windows path is matched in any case (#327). */
suite('Windows drive letters', () => {

    test('a base with C: (from ${homeDir}) matches the fsPath with c: (from VS Code)', () => {
        assert.deepStrictEqual(
            matchPathTemplate('c:\\Users\\t\\Journal\\2026\\11\\06.md', ENTRIES, 'C:\\Users\\t\\Journal', 'md'),
            { year: 2026, month: 11, day: 6 });
    });

    test('a base with c: matches an fsPath with C:', () => {
        assert.ok(matchPathTemplate('C:\\Users\\t\\Journal\\2026\\11\\06.md', ENTRIES, 'c:\\Users\\t\\Journal', 'md'));
    });

    test('forward slashes and a leading slash before the drive letter', () => {
        assert.ok(matchPathTemplate('/c:/Users/t/Journal/2026/11/06.md', ENTRIES, '/C:/Users/t/Journal', 'md'));
    });

    test('a template with an absolute path instead of ${base}', () => {
        assert.ok(matchPathTemplate('c:\\Journal\\2026\\11\\06.md', 'C:/Journal/${year}/${month}/${day}.${ext}', '', 'md'));
    });

    test('the title of a note', () => {
        assert.strictEqual(
            matchTemplateInput('c:\\Users\\t\\Journal\\2026\\11\\06\\Kickoff.md', '${base}/${year}/${month}/${day}/${input}.${ext}', 'C:\\Users\\t\\Journal', 'md'),
            'Kickoff');
    });

    test('only the drive letter: the rest of the path is matched case-sensitively', () => {
        assert.strictEqual(matchPathTemplate('c:\\users\\t\\journal\\2026\\11\\06.md', ENTRIES, 'C:\\Users\\t\\Journal', 'md'), undefined);
    });

    test('a different drive does not match', () => {
        assert.strictEqual(matchPathTemplate('d:\\Users\\t\\Journal\\2026\\11\\06.md', ENTRIES, 'C:\\Users\\t\\Journal', 'md'), undefined);
    });
});
