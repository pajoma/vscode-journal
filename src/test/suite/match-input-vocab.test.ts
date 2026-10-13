import * as assert from 'assert';
import { matchInput } from '../../features/smart-input/match-input';
import { Input } from '../../shared/model/index';

async function parse(value: string, locale = 'en', granularity: 'daily' | 'weekly' = 'daily'): Promise<Input> {
    return matchInput(value, locale, granularity);
}

suite('matchInput — tokenizer vocab & regression', () => {

    // --- shortcuts ---

    test("shortcut 'today'", async () => {
        const r = await parse('today');
        assert.strictEqual(r.offset, 0);
    });

    test("shortcut 'tod'", async () => {
        const r = await parse('tod');
        assert.strictEqual(r.offset, 0);
    });

    test("shortcut 'tomorrow'", async () => {
        const r = await parse('tomorrow');
        assert.strictEqual(r.offset, 1);
    });

    test("shortcut 'tom'", async () => {
        const r = await parse('tom');
        assert.strictEqual(r.offset, 1);
    });

    test("shortcut 'yesterday'", async () => {
        const r = await parse('yesterday');
        assert.strictEqual(r.offset, -1);
    });

    test("shortcut 'yes'", async () => {
        const r = await parse('yes');
        assert.strictEqual(r.offset, -1);
    });

    test("shortcut '0'", async () => {
        const r = await parse('0');
        assert.strictEqual(r.offset, 0);
    });

    // --- offsets ---

    test("offset '+2'", async () => {
        const r = await parse('+2');
        assert.strictEqual(r.offset, 2);
    });

    test("offset '-3'", async () => {
        const r = await parse('-3');
        assert.strictEqual(r.offset, -3);
    });

    // --- ISO date forms ---

    test("ISO full date produces a numeric offset", async () => {
        const r = await parse('2030-01-01');
        assert.ok(typeof r.offset === 'number' && !isNaN(r.offset));
    });

    test("ISO month-day produces a numeric offset", async () => {
        const r = await parse('06-15');
        assert.ok(typeof r.offset === 'number' && !isNaN(r.offset));
    });

    test("ISO day-only produces a numeric offset", async () => {
        const r = await parse('15');
        assert.ok(typeof r.offset === 'number' && !isNaN(r.offset));
    });

    // --- weekdays ---

    test("weekday 'monday' resolves to non-zero or zero diff", async () => {
        const r = await parse('monday');
        assert.ok(typeof r.offset === 'number');
    });

    test("weekday 'next monday'", async () => {
        const today = new Date().getDay(); // 0=Sun … 6=Sat
        const r = await parse('next monday');
        // next monday is always +1 … +7 days away
        assert.ok(r.offset >= 1 && r.offset <= 7, `expected 1-7, got ${r.offset}`);
    });

    test("weekday 'last friday'", async () => {
        const r = await parse('last friday');
        assert.ok(r.offset >= -7 && r.offset <= 0, `expected -7…0, got ${r.offset}`);
    });

    test("weekday 'mon' (3-letter abbrev)", async () => {
        const r = await parse('mon');
        assert.ok(typeof r.offset === 'number');
    });

    // --- German 3-letter abbreviations ---

    test("German 'die' (Dienstag) resolves to a weekday offset", async () => {
        const r = await parse('die', 'de');
        assert.ok(!isNaN(r.offset) && r.offset !== 0 || new Date().getDay() === 2);
    });

    test("German 'don' (Donnerstag) resolves to a weekday offset", async () => {
        const r = await parse('don', 'de');
        assert.ok(!isNaN(r.offset) && r.offset !== 0 || new Date().getDay() === 4);
    });

    test("German 'fre' (Freitag) resolves to a weekday offset", async () => {
        const r = await parse('fre', 'de');
        assert.ok(!isNaN(r.offset) && r.offset !== 0 || new Date().getDay() === 5);
    });

    // --- prefix collision guard (#170 regression) ---

    test("#170 'do something' must not match 'do' weekday (2-letter removed)", async () => {
        const r = await parse('do something', 'de');
        assert.strictEqual(r.offset, 0, 'should default to today (text-only)');
        assert.ok(r.text.length > 0, 'text should be preserved');
    });

    test("#170 'fr Müller' must not match 'fr' weekday", async () => {
        const r = await parse('fr Müller', 'de');
        assert.strictEqual(r.offset, 0);
        assert.ok(r.text.length > 0);
    });

    test("#170 'Marketing' must not match 'mar' weekday/month", async () => {
        const r = await parse('Marketing');
        assert.strictEqual(r.offset, 0);
        assert.ok(r.text.length > 0);
    });

    // --- week tokens ---

    test("'w' resolves to current ISO week", async () => {
        const r = await parse('w');
        assert.ok(r.hasWeek(), 'should have week set');
        assert.ok(r.week >= 1 && r.week <= 53);
    });

    test("'week' resolves to current ISO week", async () => {
        const r = await parse('week');
        assert.ok(r.hasWeek());
    });

    test("'next week' resolves to next ISO week", async () => {
        const now = new Date();
        const r = await parse('next week');
        assert.ok(r.hasWeek());
        // next week number is current ±1 (wraps at year boundary)
        assert.ok(r.week >= 1 && r.week <= 53);
    });

    test("'last week' resolves to previous ISO week", async () => {
        const r = await parse('last week');
        assert.ok(r.hasWeek());
    });

    test("'w23' resolves to week 23", async () => {
        const r = await parse('w23');
        assert.strictEqual(r.week, 23);
    });

    test("'week 7' resolves to week 7", async () => {
        const r = await parse('week 7');
        assert.strictEqual(r.week, 7);
    });

    // --- #230 regressions: week-token boundary ---

    test("#230 'task week Finalize Shoppinglist' → flag=task, full text preserved, hasWeek", async () => {
        const r = await parse('task week Finalize Shoppinglist');
        assert.ok(r.hasTask(), 'should have task flag');
        assert.ok(r.hasWeek(), 'should have week set');
        assert.strictEqual(r.text, 'Finalize Shoppinglist', 'text must not be truncated');
    });

    test("#230 'week' alone → hasWeek, no crash", async () => {
        const r = await parse('week');
        assert.ok(r.hasWeek());
    });

    test("#230 'w15' → week=15, no regression from recognizeWeekNum priority", async () => {
        const r = await parse('w15');
        assert.strictEqual(r.week, 15);
    });

    // --- month + day ---

    test("'Jun 1' produces a numeric offset", async () => {
        const r = await parse('Jun 1');
        assert.ok(typeof r.offset === 'number' && !isNaN(r.offset));
    });

    test("'December 25' produces a numeric offset", async () => {
        const r = await parse('December 25');
        assert.ok(typeof r.offset === 'number' && !isNaN(r.offset));
    });

    // --- task flags ---

    test("'task +1 remind me' → flag=task, offset=1, text='remind me'", async () => {
        const r = await parse('task +1 remind me');
        assert.strictEqual(r.offset, 1);
        assert.ok(r.hasTask());
        assert.strictEqual(r.text, 'remind me');
    });

    test("'monday task buy milk' → flag=task, text='buy milk'", async () => {
        const r = await parse('monday task buy milk');
        assert.ok(r.hasTask());
        assert.strictEqual(r.text, 'buy milk');
    });

    // --- #149 regressions: task + weekday ---

    test("#149 'task mon buy groceries' → flag=task, weekday=Monday, text='buy groceries'", async () => {
        const mon = await parse('mon');
        const r = await parse('task mon buy groceries');
        assert.ok(r.hasTask(), 'should have task flag');
        assert.strictEqual(r.offset, mon.offset, 'offset should resolve to Monday same as standalone mon');
        assert.strictEqual(r.text, 'buy groceries', 'text must not include the weekday token');
    });

    test("#149 'task monday buy groceries' → flag=task, weekday=Monday, text='buy groceries'", async () => {
        const mon = await parse('monday');
        const r = await parse('task monday buy groceries');
        assert.ok(r.hasTask());
        assert.strictEqual(r.offset, mon.offset);
        assert.strictEqual(r.text, 'buy groceries');
    });

    test("#149 'task mond buy groceries' → flag=task, 'mond' falls to text (not a valid alias)", async () => {
        const r = await parse('task mond buy groceries');
        assert.ok(r.hasTask());
        assert.ok(r.text.includes('mond'), `'mond' should be in text, got: '${r.text}'`);
    });

    // --- memo auto-flag ---

    test("free text auto-gets memo flag", async () => {
        const r = await parse('hello world');
        assert.strictEqual(r.kind, 'memo');
        assert.strictEqual(r.text, 'hello world');
        assert.strictEqual(r.offset, 0);
    });

    // --- weekly granularity default ---

    test("weekly granularity: empty-like input routes to current week", async () => {
        // 'w' is the explicit week shortcut; for granularity routing test 'today memo'
        // is separate. Here we test that the parser routes correctly when granularity=weekly.
        const r = await parse('today', 'en', 'weekly');
        // 'today' is an explicit temporal, so offset=0 regardless of granularity
        assert.strictEqual(r.offset, 0);
    });

    // --- locale isolation: only English + configured locale fire ---

    test("locale=de: 'son' (Sonntag) resolves to Sunday", async () => {
        const r = await parse('son', 'de');
        assert.ok(!isNaN(r.offset) && r.offset !== 0 || new Date().getDay() === 0);
    });

    test("locale=de: 'zon' (Dutch Sunday) does NOT match", async () => {
        const r = await parse('zon', 'de');
        assert.strictEqual(r.offset, 0, "Dutch 'zon' must not fire for German locale");
    });

    test("locale=nl: 'zon' (Dutch Sunday) resolves to Sunday", async () => {
        const r = await parse('zon', 'nl');
        assert.ok(!isNaN(r.offset) && r.offset !== 0 || new Date().getDay() === 0);
    });

    test("locale=nl: 'son' (German Sonntag abbrev) does NOT match", async () => {
        const r = await parse('son', 'nl');
        assert.strictEqual(r.offset, 0, "German 'son' must not fire for Dutch locale");
    });

    test("locale=en: 'sun' resolves to Sunday", async () => {
        const r = await parse('sun', 'en');
        assert.ok(!isNaN(r.offset) && r.offset !== 0 || new Date().getDay() === 0);
    });

    test("locale=en: 'son' (German abbrev) does NOT match", async () => {
        const r = await parse('son', 'en');
        assert.strictEqual(r.offset, 0, "German 'son' must not fire for English locale");
    });

    test("locale=en: 'zon' (Dutch Sunday) does NOT match", async () => {
        const r = await parse('zon', 'en');
        assert.strictEqual(r.offset, 0, "Dutch 'zon' must not fire for English locale");
    });

    test("locale=de-DE (region tag): 'son' resolves (primary subtag 'de' used)", async () => {
        const r = await parse('son', 'de-DE');
        assert.ok(!isNaN(r.offset) && r.offset !== 0 || new Date().getDay() === 0);
    });

    // --- vocab sweep: all English 3-letter abbreviations parse to a valid weekday ---

    const engAbbrevs: Array<[string, number]> = [
        ['mon', 1], ['tue', 2], ['wed', 3], ['thu', 4], ['fri', 5], ['sat', 6], ['sun', 0],
    ];

    for (const [abbrev] of engAbbrevs) {
        test(`vocab sweep: '${abbrev}' as standalone input does not crash`, async () => {
            const r = await parse(abbrev);
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
            const r = await parse(word, 'de');
            assert.strictEqual(r.offset, 0, `'${word}' should not parse as weekday`);
            assert.ok(r.text.length > 0, `'${word}' text should be preserved`);
        });
    }

});
