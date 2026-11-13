import * as assert from 'assert';
import { formatKey, highestKeys, keyOf, nextKey, scopeOf, scopeRefs, scopeTags, SLUG, tags, withKey } from 'journal-core';

/** The scopes of the tests: acme and web-shop, configured as written here. */
const scopeName = (name: string) => ['acme', 'web-shop'].find(scope => scope === name.toLowerCase());

suite('Scopes, keys and tags (journal-core)', () => {

    suite('reading', () => {
        test('finds tags and keys that may name a scope, as whole words', () => {
            assert.deepStrictEqual(scopeRefs('#acme call #web-shop:12 now'), [
                { index: 0, length: 5, name: 'acme', number: undefined },
                { index: 11, length: 12, name: 'web-shop', number: 12 },
            ]);
            assert.deepStrictEqual(scopeRefs('a#acme, C# and #acme:x'), []);
        });

        test('a key is the scope tag with an identifier', () => {
            assert.deepStrictEqual(tags('#urgent fix C# code #web-shop #acme:12'), ['urgent', 'web-shop', 'acme']);
        });

        test('finds the scope tags, also in keys, without the identifier', () => {
            assert.deepStrictEqual(scopeTags('- [ ] #Acme:12 call #urgent about #web-shop', scopeName), [
                { index: 6, length: 5, scope: 'acme' },
                { index: 34, length: 9, scope: 'web-shop' },
            ]);
        });

        test('takes the first tag or key that names a scope, case ignored', () => {
            assert.strictEqual(scopeOf('call #bank about #ACME', scopeName), 'acme');
            assert.strictEqual(scopeOf('call #bank', scopeName), undefined);
            assert.strictEqual(scopeOf('see #web-shop:3', scopeName), 'web-shop');
        });

        test('reads the key of a line, in a scope or the default scope', () => {
            assert.deepStrictEqual(keyOf('- [ ] #acme:12 write guide', scopeName), { scope: 'acme', number: 12 });
            assert.deepStrictEqual(keyOf('- [ ] :7 call the bank', scopeName), { number: 7 });
            assert.deepStrictEqual(keyOf('- [ ] #acme write guide', scopeName), undefined);
        });

        test('reads no key in times, other words or scopes that do not exist', () => {
            assert.strictEqual(keyOf('- [ ] call at 10:30', scopeName), undefined);
            assert.strictEqual(keyOf('- [ ] ratio 3:2, see:12', scopeName), undefined);
            assert.strictEqual(keyOf('- [ ] #bank:3 transfer', scopeName), undefined);
        });

        test('takes the first key of a line', () => {
            assert.deepStrictEqual(keyOf('- [ ] :3 see #acme:12', scopeName), { number: 3 });
            assert.deepStrictEqual(keyOf('- [ ] #acme:12 see :3', scopeName), { scope: 'acme', number: 12 });
        });
    });

    suite('slugs', () => {
        test('are lowercase and start with a letter', () => {
            assert.ok(SLUG.test('acme') && SLUG.test('web-shop') && SLUG.test('ai360'));
            assert.ok(!SLUG.test('Acme') && !SLUG.test('1st') && !SLUG.test('web_shop') && !SLUG.test(''));
        });
    });

    suite('writing', () => {
        test('formats keys', () => {
            assert.strictEqual(formatKey({ scope: 'acme', number: 12 }), '#acme:12');
            assert.strictEqual(formatKey({ number: 7 }), ':7');
        });

        test('counts per scope, case ignored, and the default scope on its own', () => {
            const texts = ['- [ ] #acme:3 a', '- [x] #ACME:11 b\n- [ ] :4 c', 'at 10:30 #web-shop:2'];
            assert.deepStrictEqual([...highestKeys(texts)].sort(), [['', 4], ['acme', 11], ['web-shop', 2]]);
            assert.deepStrictEqual(nextKey(texts, 'acme'), { scope: 'acme', number: 12 });
            assert.deepStrictEqual(nextKey(texts), { scope: undefined, number: 5 });
            assert.deepStrictEqual(nextKey(texts, 'new'), { scope: 'new', number: 1 });
        });

        test('puts the key in place of the scope tag, else in front', () => {
            assert.strictEqual(withKey('call #Acme about it', { scope: 'acme', number: 12 }, scopeName), 'call #acme:12 about it');
            assert.strictEqual(withKey('call the bank #urgent', { number: 7 }, scopeName), ':7 call the bank #urgent');
            assert.strictEqual(withKey('call #web-shop', { scope: 'acme', number: 1 }, scopeName), '#acme:1 call #web-shop');
        });

        test('keeps a key that is there', () => {
            assert.strictEqual(withKey('#acme:3 call', { scope: 'acme', number: 12 }, scopeName), '#acme:3 call');
        });
    });
});
