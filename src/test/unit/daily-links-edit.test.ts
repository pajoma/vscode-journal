import * as assert from 'assert';
import { dailyLinksEdit } from '../../features/weekly/sync-daily-links';
import { TextReplacement } from '../../shared/model/index';

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
        assert.strictEqual(dailyLinksEdit(text, anchor, block), 'up-to-date');
    });

    test('a missing section is added first under the title (#311)', () => {
        const text = '# Week 20\n\n## Tasks\n\n## Notes\n';
        const edit = dailyLinksEdit(text, anchor, block) as TextReplacement;
        assert.strictEqual(apply(text, edit), '# Week 20\n\n## Daily Entries\n\n- [Monday](05/11.md)\n\n## Tasks\n\n## Notes\n');
    });

    test('a section further down is moved under the title, its content renewed (#311)', () => {
        const text = '# Week 20\n\n## Tasks\n\n- [ ] a task\n\n## Notes\n\n## Daily Entries\n\n- old\n';
        const moved = apply(text, dailyLinksEdit(text, anchor, block) as TextReplacement);
        assert.strictEqual(moved, '# Week 20\n\n## Daily Entries\n\n- [Monday](05/11.md)\n\n## Tasks\n\n- [ ] a task\n\n## Notes\n');
        assert.strictEqual(dailyLinksEdit(moved, anchor, block), 'up-to-date', 'idempotent afterwards');
    });

    test('lines right under the title (memos) stay above the section', () => {
        const text = '# Week 20\n- MEMO 10:00: call\n\n## Daily Entries\n\n- [Monday](05/11.md)\n\n## Tasks\n';
        assert.strictEqual(dailyLinksEdit(text, anchor, block), 'up-to-date', 'the section is the first one after the memos');
        const memoAdded = '# Week 20\n- MEMO 11:00: new\n- MEMO 10:00: call\n\n## Daily Entries\n\n- [Monday](05/11.md)\n\n## Tasks\n';
        assert.strictEqual(dailyLinksEdit(memoAdded, anchor, block), 'up-to-date', 'a new memo does not move the section');
    });

    test('an entry without title: the section comes first', () => {
        const text = '## Tasks\n';
        assert.strictEqual(apply(text, dailyLinksEdit(text, anchor, block) as TextReplacement), '## Daily Entries\n\n- [Monday](05/11.md)\n\n## Tasks\n');
    });

    test('moving keeps \\r\\n line breaks', () => {
        const text = '# Week 20\r\n\r\n## Notes\r\n\r\n## Daily Entries\r\n';
        assert.strictEqual(apply(text, dailyLinksEdit(text, anchor, block) as TextReplacement),
            '# Week 20\r\n\r\n## Daily Entries\r\n\r\n- [Monday](05/11.md)\r\n\r\n## Notes\r\n');
    });

    test('an anchor in the last line gets the block after it', () => {
        const text = '# Week 20\n## Daily Entries';
        const edit = dailyLinksEdit(text, anchor, block) as TextReplacement;
        assert.strictEqual(apply(text, edit), '# Week 20\n## Daily Entries\n- [Monday](05/11.md)\n\n');
    });

    test('works with \\r\\n line breaks', () => {
        const text = '## Daily Entries\r\n\r\n- old\r\n\r\n## Notes\r\n';
        const edit = dailyLinksEdit(text, anchor, block) as TextReplacement;
        assert.deepStrictEqual(edit.start, { line: 1, character: 0 }, 'start: the line after the anchor');
        assert.deepStrictEqual(edit.end, { line: 4, character: 0 }, 'end: the start of ## Notes');
        assert.strictEqual(dailyLinksEdit('## Daily Entries\r\n\r\n- [Monday](05/11.md)\r\n\r\n## Notes\r\n', anchor, block), 'up-to-date',
            'idempotent with \\r\\n');
    });
});
