import * as assert from 'assert';
import { executions, keyedTasks, keyName, openSubtasks, planEdits, progress, subtasksToMove, TASK_BOX } from 'journal-core';

const scopeName = (name: string) => ['acme'].find(scope => scope === name.toLowerCase());

/** Plans and their execution (journal-core, docs/specs/2026-11-13-scopes-keys-plans.md). */
suite('Plans (journal-core)', () => {

    test('reads the keyed tasks of a page with their state', () => {
        const lines = ['## Phase 1', '- [ ] #acme:1 interviews', '  - [/] #ACME:2 guide', '  - [x] #acme:3 invite (done: 2026-11-10 09:00)', '- [>] :4 moved (moved: 2026-11-14)', '- [ ] no key'];
        assert.deepStrictEqual(keyedTasks(lines, scopeName), [
            { line: 1, key: '#acme:1', state: 'open' },
            { line: 2, key: '#acme:2', state: 'progress' },
            { line: 3, key: '#acme:3', state: 'done' },
            { line: 4, key: ':4', state: 'moved' },
        ]);
        assert.strictEqual(keyName('see #Acme:7', scopeName), '#acme:7');
    });

    test('an item in progress counts as open sub-task, but does not move along', () => {
        const lines = ['- [ ] parent', '  - [/] in progress', '  - [ ] open'];
        assert.deepStrictEqual(openSubtasks(lines, 0), [1, 2]);
        assert.deepStrictEqual(subtasksToMove(lines, 0).open, [2]);
        assert.strictEqual(TASK_BOX.progress, '[/]');
    });

    test('the latest day of a key in the entries counts; moved lines do not', () => {
        const executed = executions([
            { day: '2026-11-13', lines: ['- [ ] #acme:1 interviews', '- [x] #acme:3 invite (done: 2026-11-13 10:00)'] },
            { day: '2026-11-12', lines: ['- [>] #acme:1 interviews (moved: 2026-11-13)', '- [x] #acme:2 guide (done: 2026-11-12 16:30)'] },
            { day: '2026-11-14', lines: ['- [>] #acme:1 interviews (moved: 2026-11-17)'] },
        ], scopeName);
        assert.deepStrictEqual([...executed].sort(), [
            ['#acme:1', { day: '2026-11-13', done: false }],
            ['#acme:2', { day: '2026-11-12', done: true, time: '2026-11-12 16:30' }],
            ['#acme:3', { day: '2026-11-13', done: true, time: '2026-11-13 10:00' }],
        ]);
    });

    test('the plan follows the executions: in progress, done with day, reopened', () => {
        const plan = [
            '- [ ] #acme:1 interviews',
            '- [/] #acme:2 guide',
            '- [x] #acme:3 invite (done: 2026-11-10 09:00) [[2026-11-10]]',
            '- [ ] #acme:4 not executed',
            '- [/] #acme:5 still open',
        ];
        const executed = new Map([
            ['#acme:1', { day: '2026-11-13', done: false }],
            ['#acme:2', { day: '2026-11-12', done: true, time: '2026-11-12 16:30' }],
            ['#acme:3', { day: '2026-11-13', done: false }],
            ['#acme:5', { day: '2026-11-13', done: false }],
        ]);
        assert.deepStrictEqual(planEdits(plan, executed, scopeName), [
            { line: 0, text: '- [/] #acme:1 interviews' },
            { line: 1, text: '- [x] #acme:2 guide (done: 2026-11-12 16:30) [[2026-11-12]]' },
            { line: 2, text: '- [/] #acme:3 invite' },
        ]);
        assert.deepStrictEqual(planEdits(plan, executed, scopeName, new Set(['#acme:2'])).map(e => e.line), [1], 'only the keys asked for');
    });

    test('progress of a parent: done and all sub-tasks at any depth, moved ones left out', () => {
        const lines = ['- [/] #acme:1 interviews', '  - [x] a', '  - [/] b', '    - [x] b1', '  - [>] c', '- [ ] next'];
        assert.deepStrictEqual(progress(lines, 0), { done: 2, total: 3 });
        assert.deepStrictEqual(progress(lines, 5), { done: 0, total: 0 });
    });
});
