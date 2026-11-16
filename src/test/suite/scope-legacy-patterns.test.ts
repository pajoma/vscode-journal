import * as assert from 'assert';
import { scopesWithPatterns } from '../../features/scopes/legacy-patterns';

/** The one-time hint for scopes that still have their own patterns (since 1.2, notes lie flat in the scope folder). */
suite('Scopes with old patterns', () => {
    test('only entries of journal.scopes with patterns or patternHistory', () => {
        assert.deepStrictEqual(scopesWithPatterns([
            { name: 'acme', patterns: { notes: { path: '${base}/${year}' } } },
            { name: 'web', base: '${base}/clients/web' },
            { name: 'old', patternHistory: [] },
            { patterns: {} },
            'nope',
        ]), ['acme', 'old']);
        assert.deepStrictEqual(scopesWithPatterns(undefined), []);
    });
});
