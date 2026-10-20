import * as assert from 'assert';
import { daysOfWeek } from 'journal-core';
import { dailyLinksEdit, weekDatesLine } from '../../features/weekly/sync-daily-links';
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
        assert.strictEqual(apply(text, edit), '# Week 20\n## Daily Entries\n\n- [Monday](05/11.md)\n\n', 'a blank line before and after the links');
    });

    test('works with \\r\\n line breaks', () => {
        const text = '## Daily Entries\r\n\r\n- old\r\n\r\n## Notes\r\n';
        const edit = dailyLinksEdit(text, anchor, block) as TextReplacement;
        assert.strictEqual(apply(text, edit), '## Daily Entries\r\n\r\n- [Monday](05/11.md)\r\n\r\n## Notes\r\n', 'the links replaced, \\r\\n kept');
        assert.ok(edit.start.line >= 2 && edit.end.line <= 3, 'only the changed part is replaced: an open editor keeps its cursor');
        assert.strictEqual(dailyLinksEdit('## Daily Entries\r\n\r\n- [Monday](05/11.md)\r\n\r\n## Notes\r\n', anchor, block), 'up-to-date',
            'idempotent with \\r\\n');
    });

    test('the date line directly under the title, renewed in place (#311)', () => {
        const text = '# Week 26\n\n## Daily Entries\n\n- [Monday](05/11.md)\n';
        const added = apply(text, dailyLinksEdit(text, anchor, block, '06-22 .. 06-28') as TextReplacement);
        assert.strictEqual(added, '# Week 26\n06-22 .. 06-28\n\n## Daily Entries\n\n- [Monday](05/11.md)\n', 'added under the title');
        assert.strictEqual(dailyLinksEdit(added, anchor, block, '06-22 .. 06-28'), 'up-to-date', 'idempotent');
        const renewed = apply(added, dailyLinksEdit(added, anchor, block, '06-29 .. 07-05') as TextReplacement);
        assert.strictEqual(renewed, '# Week 26\n06-29 .. 07-05\n\n## Daily Entries\n\n- [Monday](05/11.md)\n', 'replaced, not added twice');
    });

    test('the date line comes before memos; no title, no date line', () => {
        const text = '# Week 26\n- MEMO 10:00: call\n\n## Daily Entries\n\n- [Monday](05/11.md)\n';
        assert.strictEqual(apply(text, dailyLinksEdit(text, anchor, block, '06-22 .. 06-28') as TextReplacement),
            '# Week 26\n06-22 .. 06-28\n- MEMO 10:00: call\n\n## Daily Entries\n\n- [Monday](05/11.md)\n');
        assert.strictEqual(dailyLinksEdit('## Daily Entries\n\n- [Monday](05/11.md)\n', anchor, block, '06-22 .. 06-28'), 'up-to-date');
    });

    test('a memo added under the title pushed the date line down: it moves back up, not twice', () => {
        const text = '# Week 26\n- MEMO 11:00: new\n06-22 .. 06-28\n- MEMO 10:00: call\n\n## Daily Entries\n\n- [Monday](05/11.md)\n';
        assert.strictEqual(apply(text, dailyLinksEdit(text, anchor, block, '06-22 .. 06-28') as TextReplacement),
            '# Week 26\n06-22 .. 06-28\n- MEMO 11:00: new\n- MEMO 10:00: call\n\n## Daily Entries\n\n- [Monday](05/11.md)\n');
    });

    test('the date line is a sentence in the journal locale: the whole week, weekend included, with weekday and month', () => {
        assert.strictEqual(weekDatesLine(daysOfWeek(42, 2027, 'en'), 'en'), '*From Sunday, October 10th to Saturday, October 16th*', 'English: weeks from Sunday');
        assert.strictEqual(weekDatesLine(daysOfWeek(42, 2027, 'en-GB'), 'en-GB'), '*From Monday, 18 October to Sunday, 24 October*', 'British English');
        assert.strictEqual(weekDatesLine(daysOfWeek(42, 2027, 'de'), 'de'), '*Vom Montag, 18. Oktober bis Sonntag, 24. Oktober*', 'German: weeks from Monday');
        assert.strictEqual(weekDatesLine(daysOfWeek(42, 2027, 'fr'), 'fr'), '*lundi, 18 octobre 2027 – dimanche, 24 octobre 2027*', 'other locales: the long date and a dash');
        assert.strictEqual(weekDatesLine(daysOfWeek(53, 2026, 'de'), 'de'), '*Vom Montag, 28. Dezember bis Sonntag, 3. Januar*', 'across New Year');
    });

    test('the sentence replaces the old "06-22 .. 06-28" line; an italic line of the user stays', () => {
        const sentence = '*Vom Montag, 22. Juni bis Freitag, 26. Juni*';
        const old = '# Week 26\n06-22 .. 06-28\n\n## Daily Entries\n\n- [Monday](05/11.md)\n';
        assert.strictEqual(apply(old, dailyLinksEdit(old, anchor, block, sentence) as TextReplacement),
            `# Week 26\n${sentence}\n\n## Daily Entries\n\n- [Monday](05/11.md)\n`, 'replaced, not added');
        const own = '# Week 26\n*Sprint 12: release*\n\n## Daily Entries\n\n- [Monday](05/11.md)\n';
        assert.strictEqual(apply(own, dailyLinksEdit(own, anchor, block, sentence) as TextReplacement),
            `# Week 26\n${sentence}\n*Sprint 12: release*\n\n## Daily Entries\n\n- [Monday](05/11.md)\n`, 'the user\'s italic line is kept');
    });
});
