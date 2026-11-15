import * as assert from 'assert';
import { firstLinkingDays, isScopeReport, scopeReport } from 'journal-core';

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
        link: (path, name) => `[${name}](file://${path})`,
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

    test('only headings with tasks in their section; checkboxes in code blocks are no tasks', () => {
        const text = scopeReport({
            scope: 'acme',
            plans: [{ name: 'Plan', path: '/p', lines: ['# Plan', '## Background', 'prose only', '```', '- [ ] an example, no task', '```', '## Phase 1', '### Interviews', '- [ ] #acme:1 guide', '### Later', 'nothing yet', '## Phase 2', '- [ ] #acme:2 report'] }],
            entries: [], from: '2026-11-01', to: '2026-11-13', scopeName, link: (p, name) => `[${name}](${p})`,
        });
        const plan = text.slice(text.indexOf('## Plan'), text.indexOf('## Journal')).split('\n').filter(line => line);
        assert.deepStrictEqual(plan, ['## Plan', '### [Plan](/p)', '#### Phase 1', '##### Interviews', '- [ ] #acme:1 guide', '#### Phase 2', '- [ ] #acme:2 report']);
    });

    test('the notes of the scope folder, newest first by the first entry linking to them, undated last', () => {
        const text = scopeReport({
            scope: 'acme', plans: [], entries: [], from: '2026-11-01', to: '2026-11-13', scopeName, link: (p, name) => `[[${name}]]`,
            notes: [{ name: 'Plan', path: '/p', day: '2026-11-02' }, { name: 'Zeta', path: '/z' }, { name: 'Kickoff', path: '/k', day: '2026-11-13' }, { name: 'Alpha', path: '/a' }],
        });
        assert.ok(text.includes('## Notes\n\n- [[Kickoff]] (2026-11-13)\n- [[Plan]] (2026-11-02)\n- [[Alpha]]\n- [[Zeta]]\n\n## Journal'), text);
        const none = scopeReport({ scope: 'acme', plans: [], entries: [], from: '2026-11-01', to: '2026-11-13', scopeName, link: p => p, notes: [] });
        assert.ok(none.includes('## Notes\n\n*No notes in the folder of the scope.*'), none);
    });

    test('a note is dated by the first entry linking to it, by wiki link to it alone or by markdown link', () => {
        const notes = [
            { path: '/j/scopes/acme/Kickoff.md', title: 'Kickoff', scope: 'acme' },
            { path: '/j/scopes/acme/Plan.md', title: 'Plan', scope: 'acme' },
            { path: '/j/scopes/web/Plan.md', title: 'Plan', scope: 'web' },
            { path: '/j/scopes/acme/Never.md', title: 'Never', scope: 'acme' },
        ];
        const days = firstLinkingDays(notes, [
            { day: '2026-11-13', path: '/j/2026/11/13.md', lines: ['- NOTE: [Kickoff](../../scopes/acme/Kickoff.md)', 'see [[acme/Plan]]'] },
            { day: '2026-11-10', path: '/j/2026/11/10.md', lines: ['- [[Kickoff]] and [[Plan]] (two notes: no link)'] },
        ]);
        assert.deepStrictEqual(Object.fromEntries(days), { '/j/scopes/acme/Kickoff.md': '2026-11-10', '/j/scopes/acme/Plan.md': '2026-11-13' });
    });

    test('the report page of a scope is recognized by its name', () => {
        assert.deepStrictEqual(['/j/scopes/acme/acme.report.md', 'C:\\j\\scopes\\acme\\acme.report.md', '/j/scopes/acme/Report.md', '/j/scopes/acme/report.md', '/j/scopes/acme/a.report/Plan.md'].map(isScopeReport), [true, true, false, false, false]);
    });

    test('says so when there is nothing', () => {
        const empty = scopeReport({ scope: 'web', plans: [], entries: [], from: '2026-11-01', to: '2026-11-13', scopeName, link: p => p });
        assert.ok(empty.includes('*No tasks in the files of the scope.*') && empty.includes('*No tasks of #web from 2026-11-01 to 2026-11-13.*'), empty);
    });
});
