import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { INJECTED_RULES, withoutInjectedRules } from '../../app/injected-colors';

const ROOT = path.resolve(__dirname, '../../..');

/** Task colors come from the theme; the colors older versions wrote into the user settings are removed (#44). */
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

    suite('grammar', () => {
        const grammar = JSON.parse(fs.readFileSync(path.join(ROOT, 'res/syntax/journal-markdown.json'), 'utf8'));
        const patterns: { match: string; name: string; captures: Record<string, { name: string }> }[] =
            [...grammar.repository.checklist.patterns, ...grammar.repository.scope.patterns];

        /** The scopes of each capture group of the first pattern matching `line`. */
        function scopes(line: string): string[] | undefined {
            for (const p of patterns) {
                const match = new RegExp(p.match).exec(line);
                if (match) { return Object.keys(p.captures).filter(i => match[+i] !== undefined).map(i => p.captures[i].name); }
            }
            return undefined;
        }

        test('every journal scope also has a standard scope that themes color', () => {
            for (const p of patterns) {
                for (const { name } of Object.values(p.captures)) {
                    const [journal, ...standard] = name.split(' ');
                    assert.ok(journal.startsWith('text.html.markdown.journal.'), name);
                    if (!journal.endsWith('.open.text')) { assert.ok(standard.length > 0, `${journal} has a theme scope`); }
                }
            }
        });

        test('open, completed and moved tasks', () => {
            assert.deepStrictEqual(scopes('- [ ] task: Review'), [
                'text.html.markdown.journal.task.open.bullet punctuation.definition.list.begin.markdown',
                'text.html.markdown.journal.task.open.marker keyword.other.task',
                'text.html.markdown.journal.task.open.keyword markup.italic',
                'text.html.markdown.journal.task.open.text',
            ]);
            assert.ok(scopes('* [x] Review')!.slice(1).every(s => s.endsWith(' comment')), 'completed tasks look like comments');
            assert.ok(scopes('- [X] Review')![1].startsWith('text.html.markdown.journal.task.completed.marker'));
            assert.ok(scopes('- [>] Review')![1].startsWith('text.html.markdown.journal.task.shifted.marker'));
        });

        test('indented tasks are tasks, too', () => {
            assert.ok(scopes('    - [ ] Sub task')![1].startsWith('text.html.markdown.journal.task.open.marker'));
        });

        test('a hyphen or a box inside a line is no task', () => {
            assert.strictEqual(scopes('a - [ ] b'), undefined);
            assert.strictEqual(scopes('- [(] Review'), undefined, 'only x and X close a task');
            assert.strictEqual(scopes('- [|] Review'), undefined, 'only < and > move a task');
        });

        test('memos, but not words that start like the keyword', () => {
            assert.deepStrictEqual(scopes('- MEMO: call Bob'), [
                'text.html.markdown.journal.memo.bullet punctuation.definition.list.begin.markdown',
                'text.html.markdown.journal.memo.keyword markup.italic',
            ]);
            assert.strictEqual(scopes('- notebook'), undefined);
        });
    });
});
