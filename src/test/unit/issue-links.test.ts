import * as assert from 'assert';
import { issueLinkMatcher, issueLinks, IssueLinkSettings } from 'journal-core';
import { issueLinkPlugin } from '../../features/issuelinks/markdown-plugin';
const MarkdownIt = require('markdown-it');

const SETTINGS: IssueLinkSettings = {
    pida: 'https://github.com/owner/pida/issues/${id}',
    dp: 'https://gitlab.example.com/group/dp/-/issues/${id}',
    op: 'https://openproject.example.com/work_packages/${id}',
    'XX-': 'https://jira.example.com/browse/XX-${id}',
};

const urls = (text: string, settings: IssueLinkSettings = SETTINGS) => issueLinks(text, settings).map(link => link.url);

/** `journal.issueLinks`: `pida#23` links to the issue (#173). */
suite('Issue links', () => {

    suite('issueLinks', () => {

        test('a prefix per tracker: GitHub, GitLab, OpenProject', () => {
            assert.deepStrictEqual(issueLinks('- [ ] fix pida#23, see dp#412 and op#123', SETTINGS), [
                { text: 'pida#23', url: 'https://github.com/owner/pida/issues/23', index: 10, length: 7 },
                { text: 'dp#412', url: 'https://gitlab.example.com/group/dp/-/issues/412', index: 23, length: 6 },
                { text: 'op#123', url: 'https://openproject.example.com/work_packages/123', index: 34, length: 6 },
            ]);
        });

        test('a prefix that ends with "-" is followed by the number (Jira)', () => {
            assert.deepStrictEqual(urls('Ticket XX-1234 update items'), ['https://jira.example.com/browse/XX-1234']);
        });

        test('the prefix in any case, written with or without "#"', () => {
            assert.deepStrictEqual(urls('PIDA#23 xx-7'), ['https://github.com/owner/pida/issues/23', 'https://jira.example.com/browse/XX-7']);
            assert.deepStrictEqual(urls('pida#23', { 'pida#': 'https://x/${id}' }), ['https://x/23']);
        });

        test('a URL without ${id} gets the number appended', () => {
            assert.deepStrictEqual(urls('pida#23', { pida: 'https://my.bug.repo/' }), ['https://my.bug.repo/23']);
        });

        test('the longest prefix wins', () => {
            assert.deepStrictEqual(urls('devop#5 op#6', { op: 'https://op/${id}', devop: 'https://devop/${id}' }), ['https://devop/5', 'https://op/6']);
        });

        test('only configured prefixes, not inside words, not without number', () => {
            for (const text of ['# Heading', '#123', 'foo#1', 'xpida#23', 'pida#23a', 'pida#', 'pida 23', 'XX-']) {
                assert.deepStrictEqual(urls(text), [], text);
            }
        });

        test('not in code spans, code blocks and URLs', () => {
            for (const text of [
                '`pida#23`',
                '``a pida#23 b``',
                '```\npida#23\n```',
                '~~~\npida#23',
                'https://github.com/owner/pida#23',
                '[the issue](https://example.com/pida#23)',
            ]) {
                assert.deepStrictEqual(urls(text), [], text);
            }
            assert.deepStrictEqual(urls('```\ncode\n```\npida#23'), ['https://github.com/owner/pida/issues/23'], 'after a code block');
        });

        test('no or invalid settings: no links', () => {
            assert.deepStrictEqual(urls('pida#23', {}), []);
            assert.deepStrictEqual(urls('pida#23', { ' ': 'https://x/${id}', pida: '' }), []);
        });

        test('only http and https URLs: a workspace setting must not run commands on Ctrl+click', () => {
            for (const url of ['command:workbench.action.terminal.new', 'javascript:alert(1)', 'file:///etc/passwd', 'vscode://x/${id}', 'my.bug.repo/${id}']) {
                assert.deepStrictEqual(urls('pida#23', { pida: url }), [], url);
            }
            assert.deepStrictEqual(urls('pida#23', { pida: 'HTTP://x/${id}' }), ['HTTP://x/23'], 'the scheme in any case');
            assert.deepStrictEqual(urls('pida#23 op#1', { pida: 'command:foo', op: 'https://op/${id}' }), ['https://op/1'], 'the other prefixes still link');
        });

        test('a matcher reads the settings once and finds the links of many texts', () => {
            const links = issueLinkMatcher(SETTINGS);
            assert.deepStrictEqual(links('pida#1').map(link => link.url), ['https://github.com/owner/pida/issues/1']);
            assert.deepStrictEqual(links('op#2 dp#3').map(link => link.url), ['https://openproject.example.com/work_packages/2', 'https://gitlab.example.com/group/dp/-/issues/3']);
        });
    });

    suite('markdown preview', () => {

        const plugin = (shows = true) => issueLinkPlugin(new MarkdownIt(), { matcher: () => issueLinkMatcher(SETTINGS), shows: () => shows });

        test('a reference becomes a link', () => {
            assert.strictEqual(plugin().render('- [ ] fix pida#23 now'),
                '<ul>\n<li>[ ] fix <a href="https://github.com/owner/pida/issues/23" class="journal-issue-link" title="https://github.com/owner/pida/issues/23">pida#23</a> now</li>\n</ul>\n');
        });

        test('code spans, code blocks and the text of links stay as they are', () => {
            const md = plugin();
            assert.strictEqual(md.renderInline('`pida#23`'), '<code>pida#23</code>');
            assert.strictEqual(md.renderInline('[pida#23](https://example.com)'), '<a href="https://example.com">pida#23</a>');
            assert.strictEqual(md.render('```\npida#23\n```'), '<pre><code>pida#23\n</code></pre>\n');
        });

        test('several references in one text', () => {
            assert.strictEqual(plugin().renderInline('pida#1, op#2'),
                '<a href="https://github.com/owner/pida/issues/1" class="journal-issue-link" title="https://github.com/owner/pida/issues/1">pida#1</a>, '
                + '<a href="https://openproject.example.com/work_packages/2" class="journal-issue-link" title="https://openproject.example.com/work_packages/2">op#2</a>');
        });

        test('outside the journal the reference stays text', () => {
            assert.strictEqual(plugin(false).renderInline('fix pida#23'), 'fix pida#23');
        });
    });
});
