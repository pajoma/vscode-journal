import * as assert from 'assert';
import { scopeReport } from 'journal-core';

const scopeName = (name: string) => ['acme', 'web'].find(scope => scope === name.toLowerCase());

/** The report of a scope (journal-core, docs/specs/2026-11-13-scopes-keys-plans.md, decision 19). */
suite('Scope report (journal-core)', () => {
    const report = (from = '2026-10-15', to = '2026-11-13') => scopeReport({
        scope: 'acme',
        plans: [
            { name: 'Plan', path: '/j/scopes/acme/Plan.md', lines: ['# Plan', '', 'Some prose.', '## Phase 1', '- [/] #acme:5 interviews', '  - [x] #acme:6 guide (done: 2026-11-12 10:00) [[2026-11-12]]', '  - [ ] invite', '## Ideas', 'nothing yet'] },
            { name: 'Notes', path: '/j/scopes/acme/Notes.md', lines: ['# Notes', 'no tasks'] },
        ],
        entries: [
            { day: '2026-11-12', path: '/j/2026/11/12.md', lines: ['- [x] #acme:6 guide [[Plan]] (done: 2026-11-12 10:00)', '- [>] #acme:5 interviews (moved: 2026-11-13)', '- [ ] #web call'] },
            { day: '2026-11-13', path: '/j/2026/11/13.md', lines: ['- [ ] #acme:5 interviews [[Plan]]', '- [ ] call #ACME about it', '- [ ] :3 other'] },
            { day: '2026-09-01', path: '/j/2026/09/01.md', lines: ['- [x] #acme:1 long ago'] },
        ],
        from, to, scopeName,
        link: path => `file://${path}`,
    });

    test('the plan by heading with state and progress, the journal by day, newest first', () => {
        assert.strictEqual(report(), [
            '# #acme',
            '',
            'Plan: 1 open, 1 in progress, 1 done. Journal 2026-10-15 – 2026-11-13: 1 done.',
            '',
            '## Plan',
            '',
            '### [Plan](file:///j/scopes/acme/Plan.md)',
            '',
            '#### Phase 1',
            '',
            '- [/] #acme:5 interviews *(1/2)*',
            '  - [x] #acme:6 guide (done: 2026-11-12 10:00) [[2026-11-12]]',
            '  - [ ] invite',
            '',
            '## Journal',
            '',
            '### [2026-11-13](file:///j/2026/11/13.md)',
            '',
            '- [ ] #acme:5 interviews [[Plan]]',
            '- [ ] call #ACME about it',
            '',
            '### [2026-11-12](file:///j/2026/11/12.md)',
            '',
            '- [x] #acme:6 guide [[Plan]] (done: 2026-11-12 10:00)',
            '',
        ].join('\n'));
    });

    test('says so when there is nothing', () => {
        const empty = scopeReport({ scope: 'web', plans: [], entries: [], from: '2026-11-01', to: '2026-11-13', scopeName, link: p => p });
        assert.ok(empty.includes('*No tasks in the files of the scope.*') && empty.includes('*No tasks of #web from 2026-11-01 to 2026-11-13.*'), empty);
    });
});
