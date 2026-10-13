import * as assert from 'assert';
import { dailyLinksEdit, TextReplacement } from '../../features/weekly/sync-daily-links';

/** Applies a replacement to text with \n or \r\n line breaks. */
function apply(text: string, edit: TextReplacement): string {
    const lines = text.split(/\r?\n/);
    const breaks = text.match(/\r?\n/g) ?? [];
    const offset = (p: { line: number; character: number }) =>
        lines.slice(0, p.line).reduce((sum, l, i) => sum + l.length + breaks[i].length, 0) + p.character;
    return text.slice(0, offset(edit.start)) + edit.value + text.slice(offset(edit.end));
}

/** The block computation of the weekly daily-links sync, without VS Code (#276). */
suite('dailyLinksEdit (node)', () => {
    const anchor = '## Daily Entries';
    const block = '- [Monday](05/11.md)';

    test('replaces the block up to the next heading', () => {
        const text = '# Week 20\n\n## Daily Entries\n\n- old\n\n## Notes\n';
        const edit = dailyLinksEdit(text, anchor, block) as TextReplacement;
        assert.strictEqual(apply(text, edit), '# Week 20\n\n## Daily Entries\n\n- [Monday](05/11.md)\n\n## Notes\n');
    });

    test('is idempotent: no edit when the block is already there', () => {
        const text = '## Daily Entries\n\n- [Monday](05/11.md)\n\n## Notes\n';
        assert.strictEqual(dailyLinksEdit(text, anchor, block), undefined);
    });

    test('reports a missing anchor', () => {
        assert.strictEqual(dailyLinksEdit('# Week 20\n\n## Notes\n', anchor, block), 'no-anchor');
    });

    test('an anchor in the last line gets the block after it', () => {
        const text = '# Week 20\n## Daily Entries';
        const edit = dailyLinksEdit(text, anchor, block) as TextReplacement;
        assert.strictEqual(apply(text, edit), '# Week 20\n## Daily Entries\n- [Monday](05/11.md)\n\n');
    });

    test('works with \\r\\n line breaks', () => {
        const text = '## Daily Entries\r\n\r\n- old\r\n\r\n## Notes\r\n';
        const edit = dailyLinksEdit(text, anchor, block) as TextReplacement;
        assert.deepStrictEqual(edit.start, { line: 1, character: 0 });
        assert.deepStrictEqual(edit.end, { line: 4, character: 0 });
        assert.strictEqual(dailyLinksEdit('## Daily Entries\r\n\r\n- [Monday](05/11.md)\r\n\r\n## Notes\r\n', anchor, block), undefined);
    });
});
