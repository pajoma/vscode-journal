import * as assert from 'assert';
import { INJECTED_RULES, withoutInjectedRules } from '../../app/injected-colors';

/** The colors older versions wrote into the user settings are removed (#44); the grammar is tested in suite/issue-44-grammar.test.ts. */
suite('Issue #44 — task colors follow the theme', () => {

    suite('removing the colors older versions wrote', () => {
        const injected = INJECTED_RULES[0];
        const own = { scope: 'text.html.markdown.journal.task.open.marker', settings: { foreground: '#00FF00' } };

        test('removes the injected rules and keeps the user\'s own rules and other keys', () => {
            const settings = { comments: '#888888', '[Monokai]': { strings: '#FF0000' }, textMateRules: [injected, own, { scope: 'string', settings: {} }] };
            assert.deepStrictEqual(withoutInjectedRules(settings), {
                comments: '#888888', '[Monokai]': { strings: '#FF0000' }, textMateRules: [own, { scope: 'string', settings: {} }],
            });
        });

        test('settings in another key order count as injected', () => {
            const bold = { scope: 'text.html.markdown.journal.scope', settings: { foreground: '#FFFF00', fontStyle: 'bold' } };
            const reordered = { scope: bold.scope, settings: { fontStyle: 'bold', foreground: '#FFFF00' } };
            assert.strictEqual(withoutInjectedRules({ textMateRules: [bold, reordered] }), undefined);
        });

        test('drops textMateRules when it held only injected rules, and the setting when nothing is left', () => {
            assert.deepStrictEqual(withoutInjectedRules({ comments: '#888888', textMateRules: [...INJECTED_RULES] }), { comments: '#888888' });
            assert.strictEqual(withoutInjectedRules({ textMateRules: [...INJECTED_RULES] }), undefined);
        });

        test('returns the same object when there is nothing to remove, so the settings are not written', () => {
            const settings = { textMateRules: [own] };
            assert.strictEqual(withoutInjectedRules(settings), settings);
            assert.strictEqual(withoutInjectedRules(undefined), undefined);
            const noRules = { comments: '#888888' };
            assert.strictEqual(withoutInjectedRules(noRules), noRules);
        });
    });

});
