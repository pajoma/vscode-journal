import * as assert from 'assert';
import { MigrationView, renderMigration, Translate } from '../../features/layouts/ui/migration-view';
import { escapeHtml } from '../../shared/webview/html';

const PAGE = { cspSource: 'vscode-webview://test', nonce: 'NONCE123' };
const t: Translate = (message, ...args) => message.replace(/\{(\d+)\}/g, (_m, i) => String(args[Number(i)]));

const VIEW: MigrationView = {
    moves: [{ kind: 'entry', from: '2026/10/09.md', to: '2026/2026-10-09.md', scope: 'default' }],
    conflicts: [{ kind: 'entry', from: '2026/10/12.md', to: '2026/2026-10-12.md', scope: 'default', reason: 'exists' }],
    links: [{ file: '2026/2026-10-09.md', links: [{ from: './09/<b>.md', to: '../notes/<b>.md' }] }],
    state: 'preview',
};

/** The dry-run page of Journal: Migrate to Current Layout (#309). */
suite('Migration page (#309)', () => {

    test('the dry run: summary, moves, link changes, conflicts, Move and Close (preview only)', () => {
        const html = renderMigration(VIEW, PAGE, t);
        assert.ok(html.includes('1 files to move · 1 links in 1 files to update · 1 files stay where they are'));
        assert.ok(html.includes('Dry run: nothing has been changed yet.'));
        assert.ok(html.includes('<td class="path">2026/10/09.md</td><td class="path">2026/2026-10-09.md</td>'));
        assert.ok(html.includes('<td class="path">./09/&lt;b&gt;.md</td><td class="path">../notes/&lt;b&gt;.md</td>'), 'paths are escaped');
        assert.ok(!html.includes('<b>.md'));
        assert.ok(html.includes('<button id="move">Move 1 files</button>'));
        assert.ok(html.includes('<button id="close" class="secondary">Close (preview only)</button>'));
        assert.ok(html.includes('id="conflicts"'));
    });

    test('a strict content security policy: only the nonce runs', () => {
        const html = renderMigration(VIEW, PAGE, t);
        assert.ok(html.includes("default-src 'none'"));
        assert.ok(html.includes("script-src 'nonce-NONCE123'"));
        assert.ok(html.includes('<script nonce="NONCE123">'));
        assert.ok(!/<script(?![^>]*nonce="NONCE123")/.test(html), 'no script without the nonce');
    });

    test('nothing to move: Move is disabled; while moving, both buttons are', () => {
        assert.ok(renderMigration({ ...VIEW, moves: [] }, PAGE, t).includes('<button id="move" disabled>'));
        const running = renderMigration({ ...VIEW, state: 'running' }, PAGE, t);
        assert.ok(running.includes('<button id="move" disabled>Moving…</button>'));
        assert.ok(running.includes('<button id="close" class="secondary" disabled>'));
    });

    test('done: the result, failures, only Close', () => {
        const html = renderMigration({ ...VIEW, state: 'done', result: { moved: 1, linkFiles: 1, failed: [{ from: '2026/week_41.md', error: 'locked' }] } }, PAGE, t);
        assert.ok(html.includes('Moved 1 files, updated the links in 1 files. 1 files could not be moved.'));
        assert.ok(html.includes('<td class="path">2026/week_41.md</td><td>locked</td>'));
        assert.ok(!html.includes('id="move"') && !html.includes('Dry run'));
        assert.ok(html.includes('<button id="close">Close</button>'));
    });

    test('escapeHtml', () => {
        assert.strictEqual(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    });
});
