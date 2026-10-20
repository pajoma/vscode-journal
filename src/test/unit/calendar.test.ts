import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HostEnvironment, JournalConfiguration, SettingsWithDefaults } from 'journal-core';
import { addMonths, calendarMonth, monthsOfWeek, monthWeeks } from '../../features/calendar/calendar-model';
import { renderCalendar, Translate } from '../../features/calendar/calendar-view';
import { daySummaries } from '../../features/calendar/day-summaries';
import { Backlinks } from '../../shared/journal/backlinks';
import { NodeFileSystem } from '../node-fs';

const t: Translate = (message, ...args) => message.replace(/\{(\d+)\}/g, (_m, i) => String(args[Number(i)]));
const PAGE = { cspSource: 'vscode-webview://test', nonce: 'NONCE42' };
const rows = (year: number, month: number, locale: string) =>
    monthWeeks(year, month, locale).map(w => `${w.year}-w${w.week} ${w.days[0].getDate()}.${w.days[0].getMonth() + 1}`);

/** Quick navigation between day, week and month: the Journal Calendar (#311). */
suite('Journal Calendar (#311)', () => {

    suite('the weeks of a month', () => {

        test('from the week of the first day to the week of the last, in the journal locale', () => {
            assert.deepStrictEqual(rows(2026, 10, 'en'), ['2026-w40 27.9', '2026-w41 4.10', '2026-w42 11.10', '2026-w43 18.10', '2026-w44 25.10'],
                'English weeks start on Sunday');
            assert.deepStrictEqual(rows(2026, 10, 'de'), ['2026-w40 28.9', '2026-w41 5.10', '2026-w42 12.10', '2026-w43 19.10', '2026-w44 26.10'],
                'German weeks start on Monday');
        });

        test('around New Year: week 53 belongs to the year before', () => {
            assert.strictEqual(rows(2027, 1, 'de')[0], '2026-w53 28.12', 'January 2027 starts in week 53 of 2026');
            assert.strictEqual(rows(2026, 12, 'de').at(-1), '2026-w53 28.12', 'December 2026 ends with week 53');
        });

        test('the months a week touches; the month before and after', () => {
            assert.deepStrictEqual(monthsOfWeek(44, 2026, 'de'), [{ year: 2026, month: 10 }, { year: 2026, month: 11 }], 'week 44 spans October and November');
            assert.deepStrictEqual(monthsOfWeek(43, 2026, 'de'), [{ year: 2026, month: 10 }], 'week 43 lies in October');
            assert.deepStrictEqual(addMonths(2026, 12, 1), { year: 2027, month: 1 }, 'after December');
            assert.deepStrictEqual(addMonths(2026, 1, -1), { year: 2025, month: 12 }, 'before January');
        });

        test('a month: title and weekdays in the locale, days of the month, today, entries, weekly entries', () => {
            const month = calendarMonth(2026, 10, 'de', new Date(2026, 9, 20), new Map([['2026-10-19', { open: 2, tasks: 3, notes: 1 }]]), new Set(['2026-w43']));
            assert.strictEqual(month.title, 'Oktober 2026');
            assert.deepStrictEqual(month.weekdays, ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'], 'from Monday');
            const week43 = month.weeks[3];
            assert.deepStrictEqual([week43.week, week43.exists, week43.key], [43, true, '2026-w43'], 'week 43 has a weekly entry');
            assert.deepStrictEqual(week43.days[0], { key: '2026-10-19', day: 19, inMonth: true, today: false, entry: { open: 2, tasks: 3, notes: 1 } }, 'Monday with its entry');
            assert.strictEqual(week43.days[1].today, true, 'Tuesday 20 is today');
            assert.strictEqual(month.weeks[0].days[0].inMonth, false, '28 September is outside the month');
        });
    });

    suite('the page', () => {
        const month = calendarMonth(2026, 10, 'en', new Date(2026, 9, 20),
            new Map([['2026-10-19', { open: 2, tasks: 3, notes: 1 }], ['2026-10-20', { open: 0, tasks: 2, notes: 0 }]]), new Set(['2026-w43']));
        const html = renderCalendar(month, PAGE, t);

        test('days: open tasks marked, counts, missing days dimmed, today highlighted', () => {
            assert.ok(html.includes('<button class="day open" data-day="2026-10-19" title="2026-10-19 · 2 of 3 tasks open · 1 note"><span class="number">19</span><span class="tasks">⚠ 2/3</span><span class="notes">1 note</span></button>'), 'open tasks');
            assert.ok(html.includes('<button class="day today" data-day="2026-10-20"'), 'today, all tasks done: not marked');
            assert.ok(html.includes('<span class="tasks">✓ 0/2</span>'), 'all done: a check');
            assert.ok(html.includes('<button class="day missing" data-day="2026-10-21" title="2026-10-21: no entry yet, a click creates it">'), 'no entry: dimmed');
            assert.ok(html.includes('<button class="day outside missing" data-day="2026-09-27"'), 'a day of the month before');
        });

        test('weeks: the number opens the weekly entry; a missing one is dimmed', () => {
            assert.ok(html.includes('<button class="week" data-week="43" data-year="2026" title="Open week 43">43</button>'), 'existing week');
            assert.ok(html.includes('<button class="week missing" data-week="42" data-year="2026" title="Create week 42">42</button>'), 'missing week');
        });

        test('title, month navigation and a strict content security policy', () => {
            assert.ok(html.includes('<h1>October 2026</h1>'));
            assert.ok(html.includes('id="previous"') && html.includes('id="next"') && html.includes('id="today"'), 'month buttons');
            assert.ok(html.includes("script-src 'nonce-NONCE42'") && html.includes('<script nonce="NONCE42">'), 'only the script with the nonce runs');
        });
    });

    suite('backlinks of a note', () => {
        let base: string;
        setup(() => { base = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-backlinks-')); });
        teardown(() => fs.rmSync(base, { recursive: true, force: true }));
        const write = (file: string, text: string) => {
            fs.mkdirSync(path.dirname(path.join(base, file)), { recursive: true });
            fs.writeFileSync(path.join(base, file), text);
            return path.join(base, file);
        };

        test('pages that link by markdown or wiki link; a changed page is read again', async () => {
            const note = write('2026/10/20/Konzept.md', '# Konzept\n');
            const day = write('2026/10/20.md', '- NOTE: [Konzept](20/Konzept.md#ziel)\n');
            const week = write('2026/week_43.md', 'see [[konzept]]\n');
            const other = write('2026/10/21.md', '[web](https://example.com/20/Konzept.md) [[Other]]\n');
            const files = {
                days: new Map([['2026-10-20', day], ['2026-10-21', other]]),
                weeks: new Map([['2026-w43', week]]),
                notes: [{ path: note, title: 'Konzept', scope: 'default' }],
                targets: new Map<string, string>(),
            };
            const backlinks = new Backlinks(new NodeFileSystem());
            assert.deepStrictEqual(await backlinks.to(note, files), [day, week], 'markdown link with anchor, wiki link without case; not a web link');

            fs.writeFileSync(other, 'now [[Konzept]] too\n');
            const later = new Date(Date.now() + 5000);
            fs.utimesSync(other, later, later);
            assert.deepStrictEqual(await backlinks.to(note, files), [day, other, week], 'the changed page links now');
        });
    });

    suite('the tasks and notes of the days', () => {
        let base: string;
        setup(() => { base = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-calendar-')); });
        teardown(() => fs.rmSync(base, { recursive: true, force: true }));

        test('counted like the entry list: moved tasks and links to entries are no notes; days without entry left out', async () => {
            const config = new JournalConfiguration(new SettingsWithDefaults({ base }), { language: 'en', workspaceRoot: () => base } as HostEnvironment);
            const entry = path.join(base, '2026', '10', '19.md');
            fs.mkdirSync(path.dirname(entry), { recursive: true });
            fs.writeFileSync(entry, '# Monday\n\n- [ ] open\n- [x] done\n- [>] moved (moved: [Tue](20.md))\n- NOTE: [Konzept](19/Konzept.md)\n- [Week](../week_43.md)\n');
            const files = { days: new Map([['2026-10-19', entry]]), weeks: new Map<string, string>(), notes: [], targets: new Map<string, string>() };
            const summaries = await daySummaries(new NodeFileSystem(), config, files, ['2026-10-19', '2026-10-20']);
            assert.deepStrictEqual([...summaries], [['2026-10-19', { open: 1, tasks: 2, notes: 1 }]]);
        });
    });
});
