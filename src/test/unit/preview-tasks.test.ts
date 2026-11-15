import * as assert from 'assert';
import { taskPlugin } from '../../features/tasks/markdown-plugin';
const MarkdownIt = require('markdown-it');

/** The tasks of journal files in the markdown preview. */
suite('Tasks in the preview', () => {
    const render = (text: string, journal = true) => taskPlugin(new MarkdownIt(), () => journal).render(text);

    test('the box of a task shows its state: open, done, in progress, moved', () => {
        const html = render('- [ ] open\n- [x] done\n- [X] done too\n- [/] in progress\n- [>] moved (moved: 2026-11-16)\n');
        for (const [state, text] of [['open', 'open'], ['done', 'done'], ['done', 'done too'], ['progress', 'in progress'], ['moved', 'moved (moved: 2026-11-16)']]) {
            assert.ok(html.includes(`<li class="journal-task-item journal-task-${state}"><span class="journal-task-box journal-task-${state}"`), `${state}: ${html}`);
            assert.ok(html.includes(`></span>${text}</li>`), `${text}: ${html}`);
        }
    });

    test('sub-tasks, loose lists and the rest of the text as before; no box without a list item', () => {
        const html = render('- [ ] interviews #acme:5 [[Plan]]\n  - [x] **guide**\n\n- [] older template\n\n[ ] no list\n\n- no task [ ]\n');
        assert.ok(html.includes('aria-label="Open"></span>interviews #acme:5 [[Plan]]'), html);
        assert.ok(html.includes('aria-label="Done"></span><strong>guide</strong>'), html);
        assert.ok(html.includes('<li class="journal-task-item journal-task-open">\n<p><span class="journal-task-box journal-task-open"'), html);
        assert.ok(html.includes('<p>[ ] no list</p>') && html.includes('<li>no task [ ]</li>'), html);
    });

    test('the classes of the list item are added to those of others, once when rendered again', () => {
        const md = taskPlugin(new MarkdownIt(), () => true);
        const tokens = md.parse('- [x] done\n', {});
        tokens.find((t: { type: string }) => t.type === 'list_item_open').attrSet('class', 'code-line');
        md.renderer.render(tokens, md.options, {});
        assert.ok(md.renderer.render(tokens, md.options, {}).includes('<li class="code-line journal-task-item journal-task-done">'));
    });

    test('outside of the journal the box stays text', () => {
        assert.strictEqual(render('- [x] done\n- [/] doing\n', false), '<ul>\n<li>[x] done</li>\n<li>[/] doing</li>\n</ul>\n');
    });
});
