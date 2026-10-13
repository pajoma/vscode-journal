import * as assert from 'assert';
import { DocumentText } from '../../shared/text/document-text';

/** Runs in plain node (npm run test:unit), without the Extension Host (#239). */
suite('DocumentText (node)', () => {

    test('lines, with \\n and \\r\\n', () => {
        for (const text of ['# Title\n\n## Tasks', '# Title\r\n\r\n## Tasks']) {
            const doc = new DocumentText(text);
            assert.strictEqual(doc.lineCount, 3);
            assert.strictEqual(doc.lineText(2), '## Tasks');
            assert.ok(doc.isEmptyOrWhitespace(1));
            assert.deepStrictEqual(doc.end(), { line: 2, character: 8 });
        }
    });

    test('positionAt counts the line break of each line', () => {
        const doc = new DocumentText('ab\r\ncd\nef');
        assert.deepStrictEqual(doc.positionAt(0), { line: 0, character: 0 });
        assert.deepStrictEqual(doc.positionAt(4), { line: 1, character: 0 });
        assert.deepStrictEqual(doc.positionAt(8), { line: 2, character: 1 });
        assert.deepStrictEqual(doc.positionAt(99), { line: 2, character: 2 }, 'clamped to the end');
    });

    test('validate clamps like vscode.TextDocument.validatePosition', () => {
        const doc = new DocumentText('abc\nde');
        assert.deepStrictEqual(doc.validate({ line: 0, character: 9 }), { line: 0, character: 3 });
        assert.deepStrictEqual(doc.validate({ line: 5, character: 0 }), { line: 1, character: 2 }, 'beyond the last line: end of text');
        assert.deepStrictEqual(doc.validate({ line: -1, character: 4 }), { line: 0, character: 0 });
    });
});
