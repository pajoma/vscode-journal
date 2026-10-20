import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as oniguruma from 'vscode-oniguruma';
import * as vsctm from 'vscode-textmate';
import { Input } from '../../shared/model/index';

const JOURNAL_GRAMMAR = path.resolve(__dirname, '../../../res/syntax/journal-markdown.json');
// the Markdown grammar of the VS Code the tests run in
const MARKDOWN_GRAMMAR = path.join(vscode.env.appRoot, 'extensions', 'markdown-basics', 'syntaxes', 'markdown.tmLanguage.json');

let markdown: Promise<vsctm.IGrammar> | undefined;

/** VS Code's Markdown grammar with the journal grammar injected, tokenized by the engine VS Code uses. */
function loadMarkdown(): Promise<vsctm.IGrammar> {
    markdown ??= (async () => {
        const wasm = fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
        await oniguruma.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
        const registry = new vsctm.Registry({
            onigLib: Promise.resolve({
                createOnigScanner: (sources: string[]) => new oniguruma.OnigScanner(sources),
                createOnigString: (text: string) => new oniguruma.OnigString(text),
            }),
            loadGrammar: async (scope: string) => {
                const file = { 'text.html.markdown': MARKDOWN_GRAMMAR, 'text.markdown.journal': JOURNAL_GRAMMAR }[scope];
                // languages embedded in code blocks are not loaded: their lines keep the code block's scopes
                return file ? vsctm.parseRawGrammar(fs.readFileSync(file, 'utf8'), file) : null;
            },
            getInjections: (scope: string) => scope === 'text.html.markdown' ? ['text.markdown.journal'] : undefined,
        });
        return (await registry.loadGrammar('text.html.markdown'))!;
    })();
    return markdown;
}

/** The scopes of the token that contains `text` in the last line of `doc`. */
async function scopesOf(doc: string, text: string): Promise<string[]> {
    const grammar = await loadMarkdown();
    let stack = vsctm.INITIAL;
    let result: string[] | undefined;
    for (const line of doc.split('\n')) {
        const { tokens, ruleStack } = grammar.tokenizeLine(line, stack);
        stack = ruleStack;
        const at = line.indexOf(text);
        result = tokens.find(t => t.startIndex <= at && at < t.endIndex)?.scopes;
    }
    assert.ok(result, `"${text}" in the last line`);
    return result;
}

const journal = (scopes: string[]) => scopes.filter(s => s.startsWith('text.html.markdown.journal.'));

/** Tasks, memos and tags get standard scopes that the theme colors, only outside of code (#44). */
suite('Issue #44 — the journal grammar in Markdown', () => {

    test('an open task: list bullet, keyword box, italic "task:"', async () => {
        const line = '- [ ] task: Review';
        assert.ok((await scopesOf(line, '-')).includes('punctuation.definition.list.begin.markdown'));
        assert.deepStrictEqual((await scopesOf(line, '[ ]')).slice(-2), ['text.html.markdown.journal.task.open.marker', 'keyword.other.task']);
        assert.deepStrictEqual((await scopesOf(line, 'task:')).slice(-2), ['text.html.markdown.journal.task.open.keyword', 'markup.italic']);
        assert.ok(!(await scopesOf(line, 'Review')).includes('comment'), 'the text keeps the color of the text');
    });

    test('done and moved tasks look like comments', async () => {
        for (const line of ['* [x] Review', '- [X] Review', '- [>] Review', '- [<] Review']) {
            assert.ok((await scopesOf(line, 'Review')).includes('comment'), line);
        }
    });

    test('an indented task in a list is a task, too', async () => {
        const scopes = await scopesOf('- [ ] Release\n    - [ ] Sub task', '[ ]');
        assert.ok(scopes.includes('keyword.other.task'), scopes.join(' '));
    });

    test('a hyphen inside a line, "[(]" and "[|]" are no tasks', async () => {
        assert.deepStrictEqual(journal(await scopesOf('a - [ ] b', '[ ]')), []);
        assert.deepStrictEqual(journal(await scopesOf('- [(] Review', 'Review')), []);
        assert.deepStrictEqual(journal(await scopesOf('- [|] Review', 'Review')), []);
    });

    test('memos, but not words that start like the keyword', async () => {
        assert.ok((await scopesOf('- MEMO: call Bob', 'MEMO')).includes('markup.italic'));
        assert.deepStrictEqual(journal(await scopesOf('- notebook', 'notebook')), []);
    });

    test('a tag is colored as far as the parser reads it', async () => {
        const scopes = await scopesOf('Meeting #my-team today', 'team');
        assert.ok(scopes.includes('entity.name.tag'), scopes.join(' '));
        const input = new Input(0);
        input.text = 'Meeting #my-team today';
        input.extractScopeAndTags([]);
        assert.deepStrictEqual(input.tags, ['#my-team'], 'the parser reads the same tag');
        assert.deepStrictEqual(journal(await scopesOf('see file.md#anchor, or #tag,', 'anchor')), []);
    });

    test('code keeps its own colors: fenced, indented and inline code', async () => {
        assert.deepStrictEqual(journal(await scopesOf('```c\n#include <stdio.h>', 'include')), []);
        assert.deepStrictEqual(journal(await scopesOf('```markdown\n- [x] example', 'example')), []);
        assert.deepStrictEqual(journal(await scopesOf('Text\n\n    #define X', 'define')), []);
        assert.deepStrictEqual(journal(await scopesOf('Run `#region` here', 'region')), []);
    });
});
