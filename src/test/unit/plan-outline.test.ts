import * as assert from 'assert';
import { executions, isNumbered, itemNumber, numberedCopies, outlineNumbers, planEdits, renumberEdits } from 'journal-core';

const scopeName = (name: string) => ['acme', 'web'].find(scope => scope === name.toLowerCase());
const apply = (lines: string[], edits: { line: number; text: string }[]) => {
    const copy = [...lines];
    for (const { line, text } of edits) { copy[line] = text; }
    return copy;
};

/** Outline numbers of plan items (docs/specs/2026-11-13-scopes-keys-plans.md, decision 26). */
suite('Plan outline numbers (journal-core)', () => {

    test('the number of an item: after the box and a leading tag or key; a top-level number has a dot', () => {
        assert.deepStrictEqual(['- [ ] 1. feature', '  - [/] 1.2 story', '- [ ] #acme:5 2.1.3 x', '- [ ] #acme 1.1 copy', '- [ ] 3 calls', '- [ ] feature 1.1', 'no task 1.'].map(line => itemNumber(line)?.number),
            ['1', '1.2', '2.1.3', '1.1', undefined, undefined, undefined]);
        assert.deepStrictEqual(itemNumber('- [ ] #acme:5 1.1 x'), { index: 14, length: 3, number: '1.1' });
    });

    test('outline numbers by place, through the file and its headings; code blocks left out', () => {
        const lines = ['# Plan', '## Phase 1', '- [ ] a', '  - [ ] b', '    - [x] c', '  - [ ] d', '- [ ] e', '## Phase 2', '```', '- [ ] code', '```', '- [ ] f', '  - [ ] g'];
        assert.deepStrictEqual([...outlineNumbers(lines)], [[2, '1'], [3, '1.1'], [4, '1.1.1'], [5, '1.2'], [6, '2'], [11, '3'], [12, '3.1']]);
    });

    test('renumbering writes missing numbers and corrects moved ones, and tells which changed', () => {
        const lines = ['# Plan', '- [ ] 2. second', '  - [ ] 2.1 story', '- [ ] 1. first', '- [ ] #acme:7 new one', '- [ ] '];
        const { edits, renamed } = renumberEdits(lines);
        assert.deepStrictEqual(apply(lines, edits), ['# Plan', '- [ ] 1. second', '  - [ ] 1.1 story', '- [ ] 2. first', '- [ ] #acme:7 3. new one', '- [ ] 4. ']);
        assert.deepStrictEqual([...renamed], [['2', '1'], ['2.1', '1.1'], ['1', '2']]);
        assert.deepStrictEqual(renumberEdits(apply(lines, edits)).edits, [], 'stable once numbered');
        assert.ok(isNumbered(lines) && !isNumbered(['- [ ] 3 calls', '- [ ] plain']));
    });

    test('numbered copies in an entry: scope, number and plan link, and the numbered sub-tasks below them', () => {
        const lines = ['# Monday', '- [ ] #acme 1. feature [[Plan]]', '  - [x] 1.1 story', '  - [ ] note without number', '- [ ] 2. call #acme team [[acme/Plan]]', '- [ ] #acme 3. no plan [[2026-11-13]]', '- [ ] 4. no scope [[Plan]]', '  - [ ] 4.1 neither'];
        assert.deepStrictEqual(numberedCopies(lines, scopeName).map(c => [c.line, c.id]), [[1, 'acme/plan#1'], [2, 'acme/plan#1.1'], [4, 'acme/acme/plan#2']]);
    });

    test('a numbered plan item follows its numbered copies: in progress, done with the day, reopened', () => {
        const plan = ['# Plan', '- [/] 1. feature', '  - [ ] 1.1 story', '  - [ ] 1.2 other', '- [ ] 2. later'];
        const executed = executions([
            { day: '2026-11-13', lines: ['- [>] #acme 1. feature [[Plan]] (moved: 2026-11-16)', '  - [x] 1.1 story (done: 2026-11-13 10:00)'] },
            { day: '2026-11-16', lines: ['- [ ] #acme 1. feature [[Plan]]', '  - [ ] 1.2 other'] },
        ], scopeName);
        const edits = planEdits(plan, executed, scopeName, undefined, { scope: 'acme', target: 'Plan' });
        assert.deepStrictEqual(apply(plan, edits), ['# Plan', '- [/] 1. feature', '  - [x] 1.1 story (done: 2026-11-13 10:00) [[2026-11-13]]', '  - [/] 1.2 other', '- [ ] 2. later']);
        assert.deepStrictEqual(planEdits(plan, executed, scopeName), [], 'without the plan, numbers link nothing');
        assert.deepStrictEqual(planEdits(plan, executed, scopeName, undefined, { scope: 'acme', target: 'Other' }), [], 'another plan');
    });
});
