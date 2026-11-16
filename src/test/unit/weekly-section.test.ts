import * as assert from 'assert';
import { weeklySection } from 'journal-core';

/** A section of a weekly entry kept by the sync: the scopes of the week. */
suite('Weekly entry section (journal-core)', () => {
    const week = ['# Week 20', '', '## Daily Entries', '', '- [[2026-05-11|Monday]]', '', '## Notes', '', 'mine'];

    test('added below the daily links once there is a block; nothing without one', () => {
        assert.deepStrictEqual(weeklySection(week, '## Scopes', '- #acme: 1 done, 0 open', '## Daily Entries'),
            ['# Week 20', '', '## Daily Entries', '', '- [[2026-05-11|Monday]]', '', '## Scopes', '', '- #acme: 1 done, 0 open', '', '## Notes', '', 'mine']);
        assert.deepStrictEqual(weeklySection(week, '## Scopes', '', '## Daily Entries'), week);
    });

    test('in place, only its content changes, also to nothing; the same block changes nothing', () => {
        const withScopes = ['# Week 20', '', '## Notes', '', '## Scopes', '', '- #acme: 1 done, 0 open', '', '## Later'];
        assert.deepStrictEqual(weeklySection(withScopes, '## Scopes', '- #acme: 2 done, 0 open\n- #web: 0 done, 1 open', '## Daily Entries'),
            ['# Week 20', '', '## Notes', '', '## Scopes', '', '- #acme: 2 done, 0 open', '- #web: 0 done, 1 open', '', '## Later']);
        assert.deepStrictEqual(weeklySection(withScopes, '## Scopes', '', '## Daily Entries'), ['# Week 20', '', '## Notes', '', '## Scopes', '', '## Later']);
        assert.deepStrictEqual(weeklySection(withScopes, '## Scopes', '- #acme: 1 done, 0 open', '## Daily Entries'), withScopes);
    });

    test('without the section to follow, at the end', () => {
        assert.deepStrictEqual(weeklySection(['# Week 20', '', 'text', ''], '## Scopes', '- #acme: 1 done, 0 open', '## Daily Entries'),
            ['# Week 20', '', 'text', '', '## Scopes', '', '- #acme: 1 done, 0 open', '', '']);
    });
});
