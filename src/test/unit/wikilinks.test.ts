import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { JournalConfiguration, noteTitle, noteWikiTarget, noteWikiTargets, parseWikiTarget, SettingsWithDefaults, WikiNote, wikiLinkAt, wikiLinks, wikiTargetMatchesNote } from 'journal-core';
import { resolveWikiTarget, scanJournalFiles } from '../../features/wikilinks/journal-files';
import { wikiLinkPlugin } from '../../features/wikilinks/markdown-plugin';
import { previewHref } from '../../features/wikilinks/preview-resolver';
import { pathToFileURL } from 'url';
import { NodeFileSystem } from '../node-fs';
const MarkdownIt = require('markdown-it');

const note = (file: string, title: string, scope = 'default'): WikiNote => ({ path: path.join('/j', ...file.split('/')), title, scope });

/** Wiki links: [[2026-10-20]], [[2026-w43]], [[Title]], [[#scope Title]], [[folders/Title]], [[…|Label]] (#92). */
suite('Wiki links (#92)', () => {

    suite('journal-core', () => {

        test('wikiLinks: targets, labels and positions', () => {
            const text = 'see [[2026-10-20]] and [[ Workshop Notes | the workshop ]], not [[]] or [[a\nb]]';
            assert.deepStrictEqual(wikiLinks(text), [
                { target: '2026-10-20', index: 4, length: 14 },
                { target: 'Workshop Notes', label: 'the workshop', index: 23, length: 35 },
            ]);
        });

        test('wikiLinkAt: the link that starts exactly there, with the syntax of wikiLinks', () => {
            const text = 'see [[Konzept|the concept]] and [[ ]] [[a]b]]';
            assert.deepStrictEqual(wikiLinkAt(text, 4), { target: 'Konzept', label: 'the concept', index: 4, length: 23 }, 'at the link');
            assert.strictEqual(wikiLinkAt(text, 3), undefined, 'not before it');
            assert.strictEqual(wikiLinkAt(text, 32), undefined, 'an empty target is no link');
            assert.strictEqual(wikiLinkAt(text, 38), undefined, '"]" in a target is no link');
            assert.deepStrictEqual(wikiLinks(text).map(l => l.index), [4], 'wikiLinks agrees');
        });

        test('parseWikiTarget: day, week, note with scope and folders', () => {
            assert.deepStrictEqual(parseWikiTarget('2026-10-20'), { kind: 'day', year: 2026, month: 10, day: 20 });
            assert.deepStrictEqual(parseWikiTarget('2026-w43'), { kind: 'week', year: 2026, week: 43 });
            assert.deepStrictEqual(parseWikiTarget('2026-W5'), { kind: 'week', year: 2026, week: 5 });
            assert.deepStrictEqual(parseWikiTarget('Workshop Notes'), { kind: 'note', title: 'Workshop Notes', folders: [] });
            assert.deepStrictEqual(parseWikiTarget('#projA Workshop Notes'), { kind: 'note', title: 'Workshop Notes', scope: 'projA', folders: [] });
            assert.deepStrictEqual(parseWikiTarget('2026/10/20/Minutes'), { kind: 'note', title: 'Minutes', folders: ['2026', '10', '20'] });
            assert.strictEqual(parseWikiTarget('2026-02-30').kind, 'note', 'no real day');
            assert.strictEqual(parseWikiTarget('2026-w54').kind, 'note', 'no real week');
        });

        test('noteTitle: the ${input} part of the notes file pattern, "_" read as space', () => {
            assert.strictEqual(noteTitle('/j/2026/10/09/Workshop_Notes.md'), 'Workshop Notes');
            assert.strictEqual(noteTitle('/j/notes/2026-10-09_Konzept.md', '${d:YYYY-MM-DD}_${input}.${ext}'), 'Konzept');
            assert.strictEqual(noteTitle('/j/notes/Konzept.md', '${d:YYYY-MM-DD}_${input}.${ext}'), 'Konzept', 'not by the pattern: the file name');
        });

        test('wikiTargetMatchesNote: title without case, "_" and spaces alike; folders; scope', () => {
            const minutes = note('2026/10/20/Minutes.md', 'Minutes', 'work');
            assert.ok(wikiTargetMatchesNote(parseWikiTarget('minutes'), minutes));
            assert.ok(wikiTargetMatchesNote(parseWikiTarget('Workshop_notes'), note('a/Workshop Notes.md', 'Workshop Notes')));
            assert.ok(wikiTargetMatchesNote(parseWikiTarget('20/Minutes'), minutes));
            assert.ok(wikiTargetMatchesNote(parseWikiTarget('2026/10/20/Minutes'), minutes));
            assert.ok(!wikiTargetMatchesNote(parseWikiTarget('21/Minutes'), minutes));
            assert.ok(wikiTargetMatchesNote(parseWikiTarget('#work Minutes'), minutes));
            assert.ok(!wikiTargetMatchesNote(parseWikiTarget('#home Minutes'), minutes));
            assert.ok(!wikiTargetMatchesNote(parseWikiTarget('2026-10-20'), minutes));
        });

        test('noteWikiTarget: the title, or the shortest path that tells it from the others', () => {
            const notes = [note('2026/10/20/Minutes.md', 'Minutes'), note('2026/10/27/Minutes.md', 'Minutes'), note('2026/11/20/Minutes.md', 'Minutes'), note('scopes/work/Konzept.md', 'Konzept', 'work')];
            assert.strictEqual(noteWikiTarget(notes[3], notes), 'Konzept');
            assert.strictEqual(noteWikiTarget(notes[1], notes), '27/Minutes');
            assert.strictEqual(noteWikiTarget(notes[0], notes), '10/20/Minutes');
            assert.deepStrictEqual(noteWikiTargets(notes), new Map(notes.map(n => [n.path, noteWikiTarget(n, notes)])), 'all at once: the same targets');
        });
    });

    suite('the journal files and resolving targets', () => {
        let base: string;
        let config: JournalConfiguration;
        const at = (file: string) => path.join(base, ...file.split('/'));
        const write = (file: string) => {
            fs.mkdirSync(path.dirname(at(file)), { recursive: true });
            fs.writeFileSync(at(file), '#\n');
        };

        setup(() => {
            base = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-wiki-'));
            config = new JournalConfiguration(new SettingsWithDefaults({
                base,
                patterns: {
                    entries: { path: '${base}/${year}/${month}', file: '${year}-${month}-${day}.${ext}' },
                    weeks: { path: '${base}/${year}', file: '${year}-w${week}.${ext}' },
                    notes: { path: '${base}/${year}/${month}/${day}', file: '${input}.${ext}' },
                },
            }), { language: 'en', workspaceRoot: () => base });
            config.setScopeFolders(['work']);
            for (const file of ['2026/10/2026-10-20.md', '2026/09/30.md', '2026/2026-w43.md', '2025/week_7.md',
                '2026/10/20/Workshop_Notes.md', '2026/10/20/Minutes.md', '2026/10/27/Minutes.md', 'scopes/work/Konzept.md']) {
                write(file);
            }
        });

        teardown(() => fs.rmSync(base, { recursive: true, force: true }));

        test('days and weeks of every layout, notes with title and scope', async () => {
            const files = await scanJournalFiles(new NodeFileSystem(), config);
            assert.deepStrictEqual([...files.days.keys()].sort(), ['2026-09-30', '2026-10-20']);
            assert.deepStrictEqual([...files.weeks.keys()].sort(), ['2025-w07', '2026-w43']);
            const rel = (file: string) => path.relative(base, file).split(path.sep).join('/');
            assert.deepStrictEqual(files.notes.map(n => [rel(n.path), n.title, n.scope]).sort(), [
                ['2026/10/20/Minutes.md', 'Minutes', 'default'],
                ['2026/10/20/Workshop_Notes.md', 'Workshop Notes', 'default'],
                ['2026/10/27/Minutes.md', 'Minutes', 'default'],
                ['scopes/work/Konzept.md', 'Konzept', 'work'],
            ]);
        });

        test('resolveWikiTarget: found, ambiguous, missing', async () => {
            const files = await scanJournalFiles(new NodeFileSystem(), config);
            assert.deepStrictEqual(resolveWikiTarget('2026-09-30', files), { kind: 'found', path: at('2026/09/30.md') }, 'an entry of the earlier layout');
            assert.deepStrictEqual(resolveWikiTarget('2025-w7', files), { kind: 'found', path: at('2025/week_7.md') });
            assert.deepStrictEqual(resolveWikiTarget('workshop notes', files), { kind: 'found', path: at('2026/10/20/Workshop_Notes.md') });
            assert.deepStrictEqual(resolveWikiTarget('#work Konzept', files), { kind: 'found', path: at('scopes/work/Konzept.md') });
            assert.strictEqual(resolveWikiTarget('Minutes', files).kind, 'ambiguous');
            assert.deepStrictEqual(resolveWikiTarget('27/Minutes', files), { kind: 'found', path: at('2026/10/27/Minutes.md') });
            assert.deepStrictEqual(resolveWikiTarget('2026-10-21', files), { kind: 'missing' });
            assert.deepStrictEqual(resolveWikiTarget('Nothing', files), { kind: 'missing' });
        });
    });

    suite('markdown preview', () => {
        const KONZEPT = '/j/scopes/work/Konzept.md';
        const md = wikiLinkPlugin(new MarkdownIt(), {
            file: target => target === 'Konzept' ? KONZEPT : undefined,
            href: (file, env) => (env as { from?: string } | undefined)?.from ? path.relative((env as { from: string }).from, file) : `file://${file}`,
        });

        test('a link with its target or label; a target that names no file stays as written', () => {
            assert.strictEqual(md.renderInline('see [[Konzept]]', { from: '/j/2026' }),
                'see <a href="../scopes/work/Konzept.md" class="journal-wiki-link" title="Konzept" data-href="../scopes/work/Konzept.md">Konzept</a>');
            assert.ok(md.renderInline('[[Konzept|the concept]]', { from: '/j/2026' }).endsWith('>the concept</a>'), 'the label');
            assert.strictEqual(md.renderInline('[[Unknown]]', { from: '/j/2026' }), '[[Unknown]]');
        });

        test('as in VS Code: parsed without the document, rendered with it, the link is relative to the document', () => {
            const tokens = md.parseInline('[[Konzept]]', {});
            const html = md.renderer.render(tokens, md.options, { from: '/j/2026/10' });
            assert.ok(html.includes('href="../../scopes/work/Konzept.md"'), html);
            assert.ok(html.includes('data-href="../../scopes/work/Konzept.md"'), 'data-href, which the preview opens on click: ' + html);
            assert.ok(md.renderer.render(tokens, md.options, {}).includes(`href="file://${KONZEPT}"`), 'without the document: the file');
        });

        test('the preview href: relative to the rendered document, else the file: URI', () => {
            const file = path.join(os.tmpdir(), 'j', 'scopes', 'work', 'Konzept Plan.md');
            const document = { scheme: 'file', fsPath: path.join(os.tmpdir(), 'j', '2026', '10', '20.md') };
            assert.strictEqual(previewHref(file, { currentDocument: document }), '../../scopes/work/Konzept%20Plan.md', 'relative, encoded');
            assert.strictEqual(previewHref(file, { currentDocument: undefined }), pathToFileURL(file).toString(), 'while parsing: the file');
            assert.strictEqual(previewHref(file, { currentDocument: { scheme: 'untitled', fsPath: 'x' } }), pathToFileURL(file).toString(), 'an untitled document');
        });

        test('markdown links, code and escaping are not touched', () => {
            assert.strictEqual(md.renderInline('[a](b.md) `[[Konzept]]`'), '<a href="b.md">a</a> <code>[[Konzept]]</code>');
            assert.strictEqual(md.renderInline('[[<b>]]'), '[[&lt;b&gt;]]');
        });
    });
});
