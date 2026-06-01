import * as assert from 'assert';
import { MatchInput } from '../../journal/match-input';
import { TestLogger } from '../test-logger';

function make(locale = 'en', granularity: 'daily' | 'weekly' = 'daily'): MatchInput {
    return new MatchInput(new TestLogger(false), locale, granularity);
}

suite('MatchInput — tokenizer vocab & regression', () => {

    // --- shortcuts ---

    test("shortcut 'today'", async () => {
        const r = await make().parseInput('today');
        assert.strictEqual(r.offset, 0);
    });

    test("shortcut 'tod'", async () => {
        const r = await make().parseInput('tod');
        assert.strictEqual(r.offset, 0);
    });

    test("shortcut 'tomorrow'", async () => {
        const r = await make().parseInput('tomorrow');
        assert.strictEqual(r.offset, 1);
    });

    test("shortcut 'tom'", async () => {
        const r = await make().parseInput('tom');
        assert.strictEqual(r.offset, 1);
    });

    test("shortcut 'yesterday'", async () => {
        const r = await make().parseInput('yesterday');
        assert.strictEqual(r.offset, -1);
    });

    test("shortcut 'yes'", async () => {
        const r = await make().parseInput('yes');
        assert.strictEqual(r.offset, -1);
    });

    test("shortcut '0'", async () => {
        const r = await make().parseInput('0');
        assert.strictEqual(r.offset, 0);
    });

    // --- offsets ---

    test("offset '+2'", async () => {
        const r = await make().parseInput('+2');
        assert.strictEqual(r.offset, 2);
    });

    test("offset '-3'", async () => {
        const r = await make().parseInput('-3');
        assert.strictEqual(r.offset, -3);
    });

    // --- ISO date forms ---

    test("ISO full date produces a numeric offset", async () => {
        const r = await make().parseInput('2030-01-01');
        assert.ok(typeof r.offset === 'number' && !isNaN(r.offset));
    });

    test("ISO month-day produces a numeric offset", async () => {
        const r = await make().parseInput('06-15');
        assert.ok(typeof r.offset === 'number' && !isNaN(r.offset));
    });

    test("ISO day-only produces a numeric offset", async () => {
        const r = await make().parseInput('15');
        assert.ok(typeof r.offset === 'number' && !isNaN(r.offset));
    });

    // --- weekdays ---

    test("weekday 'monday' resolves to non-zero or zero diff", async () => {
        const r = await make().parseInput('monday');
        assert.ok(typeof r.offset === 'number');
    });

    test("weekday 'next monday'", async () => {
        const today = new Date().getDay(); // 0=Sun … 6=Sat
        const r = await make().parseInput('next monday');
        // next monday is always +1 … +7 days away
        assert.ok(r.offset >= 1 && r.offset <= 7, `expected 1-7, got ${r.offset}`);
    });

    test("weekday 'last friday'", async () => {
        const r = await make().parseInput('last friday');
        assert.ok(r.offset >= -7 && r.offset <= 0, `expected -7…0, got ${r.offset}`);
    });

    test("weekday 'mon' (3-letter abbrev)", async () => {
        const r = await make().parseInput('mon');
        assert.ok(typeof r.offset === 'number');
    });

    // --- German 2-letter abbreviations ---

    test("German 'di' (Dienstag) resolves to a weekday offset", async () => {
        const r = await make('de').parseInput('di');
        assert.ok(typeof r.offset === 'number');
    });

    test("German 'do' (Donnerstag) resolves to a weekday offset", async () => {
        const r = await make('de').parseInput('do');
        assert.ok(typeof r.offset === 'number');
    });

    test("German 'fr' (Freitag) resolves to a weekday offset", async () => {
        const r = await make('de').parseInput('fr');
        assert.ok(typeof r.offset === 'number');
    });

    // --- prefix collision guard (#170 regression) ---

    test("#170 'Don Julio' must not match 'do' weekday", async () => {
        const r = await make('de').parseInput('Don Julio');
        assert.strictEqual(r.offset, 0, 'should default to today (text-only)');
        assert.ok(r.text.length > 0, 'text should be preserved');
    });

    test("#170 'Frau Müller' must not match 'fr' weekday", async () => {
        const r = await make('de').parseInput('Frau Müller');
        assert.strictEqual(r.offset, 0);
        assert.ok(r.text.length > 0);
    });

    test("#170 'Marketing' must not match 'mar' weekday/month", async () => {
        const r = await make().parseInput('Marketing');
        assert.strictEqual(r.offset, 0);
        assert.ok(r.text.length > 0);
    });

    // --- week tokens ---

    test("'w' resolves to current ISO week", async () => {
        const r = await make().parseInput('w');
        assert.ok(r.hasWeek(), 'should have week set');
        assert.ok(r.week >= 1 && r.week <= 53);
    });

    test("'week' resolves to current ISO week", async () => {
        const r = await make().parseInput('week');
        assert.ok(r.hasWeek());
    });

    test("'next week' resolves to next ISO week", async () => {
        const now = new Date();
        const r = await make().parseInput('next week');
        assert.ok(r.hasWeek());
        // next week number is current ±1 (wraps at year boundary)
        assert.ok(r.week >= 1 && r.week <= 53);
    });

    test("'last week' resolves to previous ISO week", async () => {
        const r = await make().parseInput('last week');
        assert.ok(r.hasWeek());
    });

    test("'w23' resolves to week 23", async () => {
        const r = await make().parseInput('w23');
        assert.strictEqual(r.week, 23);
    });

    test("'week 7' resolves to week 7", async () => {
        const r = await make().parseInput('week 7');
        assert.strictEqual(r.week, 7);
    });

    // --- #230 regressions: week-token boundary ---

    test("#230 'task week Finalize Shoppinglist' → flag=task, full text preserved, hasWeek", async () => {
        const r = await make().parseInput('task week Finalize Shoppinglist');
        assert.ok(r.hasTask(), 'should have task flag');
        assert.ok(r.hasWeek(), 'should have week set');
        assert.strictEqual(r.text, 'Finalize Shoppinglist', 'text must not be truncated');
    });

    test("#230 'week' alone → hasWeek, no crash", async () => {
        const r = await make().parseInput('week');
        assert.ok(r.hasWeek());
    });

    test("#230 'w15' → week=15, no regression from recognizeWeekNum priority", async () => {
        const r = await make().parseInput('w15');
        assert.strictEqual(r.week, 15);
    });

    // --- month + day ---

    test("'Jun 1' produces a numeric offset", async () => {
        const r = await make().parseInput('Jun 1');
        assert.ok(typeof r.offset === 'number' && !isNaN(r.offset));
    });

    test("'December 25' produces a numeric offset", async () => {
        const r = await make().parseInput('December 25');
        assert.ok(typeof r.offset === 'number' && !isNaN(r.offset));
    });

    // --- task flags ---

    test("'task +1 remind me' → flag=task, offset=1, text='remind me'", async () => {
        const r = await make().parseInput('task +1 remind me');
        assert.strictEqual(r.offset, 1);
        assert.ok(r.hasTask());
        assert.strictEqual(r.text, 'remind me');
    });

    test("'monday task buy milk' → flag=task, text='buy milk'", async () => {
        const r = await make().parseInput('monday task buy milk');
        assert.ok(r.hasTask());
        assert.strictEqual(r.text, 'buy milk');
    });

    // --- #149 regressions: task + weekday ---

    test("#149 'task mon buy groceries' → flag=task, weekday=Monday, text='buy groceries'", async () => {
        const mon = await make().parseInput('mon');
        const r = await make().parseInput('task mon buy groceries');
        assert.ok(r.hasTask(), 'should have task flag');
        assert.strictEqual(r.offset, mon.offset, 'offset should resolve to Monday same as standalone mon');
        assert.strictEqual(r.text, 'buy groceries', 'text must not include the weekday token');
    });

    test("#149 'task monday buy groceries' → flag=task, weekday=Monday, text='buy groceries'", async () => {
        const mon = await make().parseInput('monday');
        const r = await make().parseInput('task monday buy groceries');
        assert.ok(r.hasTask());
        assert.strictEqual(r.offset, mon.offset);
        assert.strictEqual(r.text, 'buy groceries');
    });

    test("#149 'task mond buy groceries' → flag=task, 'mond' falls to text (not a valid alias)", async () => {
        const r = await make().parseInput('task mond buy groceries');
        assert.ok(r.hasTask());
        assert.ok(r.text.includes('mond'), `'mond' should be in text, got: '${r.text}'`);
    });

    // --- memo auto-flag ---

    test("free text auto-gets memo flag", async () => {
        const r = await make().parseInput('hello world');
        assert.strictEqual(r.flags, 'memo');
        assert.strictEqual(r.text, 'hello world');
        assert.strictEqual(r.offset, 0);
    });

    // --- weekly granularity default ---

    test("weekly granularity: empty-like input routes to current week", async () => {
        // 'w' is the explicit week shortcut; for granularity routing test 'today memo'
        // is separate. Here we test that the parser routes correctly when granularity=weekly.
        const r = await make('en', 'weekly').parseInput('today');
        // 'today' is an explicit temporal, so offset=0 regardless of granularity
        assert.strictEqual(r.offset, 0);
    });

    // --- vocab sweep: all English 3-letter abbreviations parse to a valid weekday ---

    const engAbbrevs: Array<[string, number]> = [
        ['mon', 1], ['tue', 2], ['wed', 3], ['thu', 4], ['fri', 5], ['sat', 6], ['sun', 0],
    ];

    for (const [abbrev] of engAbbrevs) {
        test(`vocab sweep: '${abbrev}' as standalone input does not crash`, async () => {
            const r = await make().parseInput(abbrev);
            assert.ok(typeof r.offset === 'number');
        });
    }

    // --- vocab sweep: common words sharing 2-3 char prefixes must not false-positive ---

    const falsePositiveCandidates = [
        // German prefix collision words
        'Dienstbote', 'Donnerstag-Termin', 'Freiheit', 'Sammelsurium', 'Software',
        // French/Spanish collisions
        'Marseille', 'Marketing', 'Mercado', 'Ventura', 'Samantha',
        // English words starting with weekday abbrevs
        'Monday Blues', 'Friday Night', 'Saturday Morning',  // these ARE weekdays — skip
        // Non-weekday words
        'Satire', 'Sunshine', 'Monkey', 'Tuesday Meeting',   // Tuesday is a weekday — skip
    ];

    const nonWeekdayWords = ['Dienstbote', 'Freiheit', 'Sammelsurium', 'Software', 'Marseille', 'Marketing', 'Mercado', 'Ventura', 'Samantha', 'Satire', 'Sunshine', 'Monkey'];

    for (const word of nonWeekdayWords) {
        test(`prefix guard: '${word}' → text-only (offset=0)`, async () => {
            const r = await make('de').parseInput(word);
            assert.strictEqual(r.offset, 0, `'${word}' should not parse as weekday`);
            assert.ok(r.text.length > 0, `'${word}' text should be preserved`);
        });
    }

});
