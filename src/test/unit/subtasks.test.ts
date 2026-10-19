import * as assert from 'assert';
import { openSubtasks, subtaskLines, subtasksToMove } from 'journal-core';

// the example of issue #172: a ticket with its steps
const TICKET = [
    '## Tasks',
    '- [ ] Ticket XX-1155 update items in db',
    '  - [ ] update records in dpDB',
    '  - [x] verify new records (done: 2026-10-19 10:00)',
    '    notes on the verification',
    '  - [ ] create new requests',
    '    - [ ] for the updated records',
    '- [ ] Another task',
];

suite('Sub-tasks (journal-core, #172)', () => {

    suite('subtaskLines', () => {
        test('all lines indented deeper than the task, up to the next task on its level', () => {
            assert.deepStrictEqual(subtaskLines(TICKET, 1), [2, 3, 4, 5, 6]);
        });
        test('a task without indented lines below has no sub-tasks', () => {
            assert.deepStrictEqual(subtaskLines(TICKET, 7), []);
            assert.deepStrictEqual(subtaskLines(TICKET, 2), [], 'the next sibling is not a sub-task');
        });
        test('a sub-task has its own sub-tasks', () => {
            assert.deepStrictEqual(subtaskLines(TICKET, 5), [6]);
        });
        test('a blank line belongs to the block only if an indented line follows', () => {
            const lines = ['- [ ] parent', '  - [ ] a', '', '  - [ ] b', '', 'text'];
            assert.deepStrictEqual(subtaskLines(lines, 0), [1, 2, 3]);
        });
        test('tabs count as indentation', () => {
            assert.deepStrictEqual(subtaskLines(['- [ ] parent', '\t- [ ] a', '- [ ] next'], 0), [1]);
        });
        test('an indented task: deeper lines only', () => {
            const lines = ['  - [ ] parent', '    - [ ] a', '  - [ ] sibling'];
            assert.deepStrictEqual(subtaskLines(lines, 0), [1]);
        });
    });

    suite('openSubtasks', () => {
        test('open sub-tasks at any depth, not done ones or text', () => {
            assert.deepStrictEqual(openSubtasks(TICKET, 1), [2, 5, 6]);
        });
        test('moved sub-tasks are not open', () => {
            assert.deepStrictEqual(openSubtasks(['- [ ] p', '  - [>] a (moved: 2026-10-20)', '  - [ ] b'], 0), [2]);
        });
    });

    suite('subtasksToMove', () => {
        test('open sub-tasks go along, done ones and the lines below them stay', () => {
            assert.deepStrictEqual(subtasksToMove(TICKET, 1), {
                lines: ['  - [ ] update records in dpDB', '  - [ ] create new requests', '    - [ ] for the updated records'],
                open: [2, 5, 6],
            });
        });
        test('text under the task goes along', () => {
            assert.deepStrictEqual(subtasksToMove(['- [ ] p', '  see ticket', '  - [ ] a'], 0).lines, ['  see ticket', '  - [ ] a']);
        });
        test('indentation is relative to the task', () => {
            const lines = ['  - [ ] parent', '    - [ ] a', '      - [ ] b'];
            assert.deepStrictEqual(subtasksToMove(lines, 0).lines, ['  - [ ] a', '    - [ ] b']);
        });
        test('lines it may not move stay, with the lines below them', () => {
            const lines = ['- [ ] p', '  - [ ] private #private', '    - [ ] below it', '  - [ ] a'];
            assert.deepStrictEqual(subtasksToMove(lines, 0, (i) => i !== 1), { lines: ['  - [ ] a'], open: [3] });
            assert.deepStrictEqual(openSubtasks(lines, 0, (i) => i !== 1), [2, 3]);
        });
        test('a task without sub-tasks takes nothing along', () => {
            assert.deepStrictEqual(subtasksToMove(TICKET, 7), { lines: [], open: [] });
        });
    });
});
