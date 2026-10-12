import * as assert from 'assert';
import { MatchInput } from '../../features/smart-input/match-input';
import { getCurrentISOWeek } from '../../shared/dates/dates';
import { Input } from '../../shared/model/index';
import { TestLogger } from '../test-logger';

/** Wednesday, 14 October 2026: every offset below is relative to this day. */
const WEDNESDAY = new Date(2026, 9, 14);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function parse(value: string, locale = 'en', granularity: 'daily' | 'weekly' = 'daily', today = WEDNESDAY): Promise<Input> {
    return new MatchInput(new TestLogger(false), locale, granularity, () => new Date(today)).parseInput(value);
}

async function offsetOf(value: string, locale = 'en'): Promise<number> {
    return (await parse(value, locale)).offset;
}

/** Pins what the smart-input parser does today, so that it can be restructured safely (#269). */
suite('MatchInput — characterization (fixed today)', () => {

    test('shortcuts and offsets', async () => {
        const expected: [string, number][] = [
            ['today', 0], ['tod', 0], ['0', 0], ['heute', 0],
            ['tomorrow', 1], ['tom', 1], ['morgen', 1],
            ['yesterday', -1], ['yes', -1], ['gestern', -1],
            ['+3', 3], ['-2', -2],
        ];
        for (const [value, offset] of expected) {
            assert.strictEqual(await offsetOf(value), offset, value);
        }
    });

    test('ISO dates', async () => {
        const expected: [string, number][] = [
            ['2026-10-20', 6], ['2026/10/20', 6], ['2025-10-14', -365], ['10-20', 6], ['10/20', 6], ['20', 6], ['1', -13],
        ];
        for (const [value, offset] of expected) {
            assert.strictEqual(await offsetOf(value), offset, value);
        }
    });

    test('weekdays are taken from the current week (Monday to Sunday)', async () => {
        const expected: [string, number][] = [
            ['monday', -2], ['wednesday', 0], ['friday', 2], ['sunday', 4],
            ['last monday', -2], ['last wednesday', -7], ['last friday', -5],
            ['next monday', 5], ['next wednesday', 7], ['next friday', 2],
            ['l fri', -5], ['n mon', 5],
        ];
        for (const [value, offset] of expected) {
            assert.strictEqual(await offsetOf(value), offset, value);
        }
    });

    test('on a Sunday, weekdays are taken from the week ending today', async () => {
        const sunday = new Date(2026, 9, 18);
        const expected: [string, number][] = [
            ['sunday', 0], ['monday', -6], ['saturday', -1],
            ['last sunday', -7], ['next sunday', 7], ['last monday', -6], ['next monday', 1],
        ];
        for (const [value, offset] of expected) {
            assert.strictEqual((await parse(value, 'en', 'daily', sunday)).offset, offset, value);
        }
    });

    test('localized weekdays', async () => {
        assert.strictEqual(await offsetOf('freitag', 'de'), 2);
        assert.strictEqual(await offsetOf('letzten', 'de'), 0, 'German modifiers are not supported: text only');
        assert.strictEqual(await offsetOf('vendredi', 'fr'), 2);
        assert.strictEqual(await offsetOf('lunes', 'es'), -2);
    });

    test('month and day', async () => {
        assert.strictEqual(await offsetOf('Dec 24'), 71);
        assert.strictEqual(await offsetOf('December 24'), 71);
        assert.strictEqual(await offsetOf('June 1'), -135);
        assert.strictEqual(await offsetOf('Dezember 3', 'de'), 50);
    });

    test('month abbreviations resolve to the month they were recognized as', async () => {
        const expected: [string, string, number][] = [
            ['Okt 3', 'de', -11], ['Dez 24', 'de', 71],
            ['Juil 14', 'fr', -92], ['Ago 1', 'es', -74], ['Ott 3', 'it', -11], ['Out 3', 'pt', -11],
        ];
        for (const [value, locale, offset] of expected) {
            assert.strictEqual(await offsetOf(value, locale), offset, `${value} (${locale})`);
        }
    });

    test('weeks', async () => {
        const current = getCurrentISOWeek(WEDNESDAY);
        const expected: [string, number][] = [
            ['w', current], ['week', current],
            ['next week', getCurrentISOWeek(new Date(WEDNESDAY.getTime() + WEEK_MS))],
            ['last week', getCurrentISOWeek(new Date(WEDNESDAY.getTime() - WEEK_MS))],
            ['w23', 23], ['week 7', 7],
        ];
        for (const [value, week] of expected) {
            const input = await parse(value);
            assert.strictEqual(input.week, week, value);
            assert.ok(isNaN(input.offset), `${value}: a week has no day offset`);
        }
    });

    test('flags, memo and text', async () => {
        const task = await parse('task buy milk');
        assert.deepStrictEqual([task.flags, task.text, task.offset], ['task', 'buy milk', 0]);

        const later = await parse('tomorrow todo call Bob');
        assert.deepStrictEqual([later.flags, later.text, later.offset], ['todo', 'call Bob', 1]);

        const memo = await parse('friday buy milk');
        assert.deepStrictEqual([memo.flags, memo.text, memo.offset], ['memo', 'buy milk', 2]);

        await assert.rejects(() => parse('task'), /No text found/);
    });

    test('tags are left to Input: each tag once, also in the middle of the text', async () => {
        const input = await parse('Konzept #work Entwurf');
        input.extractScopeAndTags(['work']);
        assert.deepStrictEqual(input.tags, ['#work']);
        assert.strictEqual(input.scope, 'work');
    });

    test('confidence', async () => {
        assert.strictEqual((await parse('friday')).confidence, 'resolved');
        assert.strictEqual((await parse('fri')).confidence, 'ambiguous');
        assert.strictEqual((await parse('buy milk')).confidence, 'text-only');
    });

    test('text without a date opens today, or the current week with weekly entries', async () => {
        assert.strictEqual((await parse('buy milk')).offset, 0);

        const weekly = await parse('buy milk', 'en', 'weekly');
        assert.strictEqual(weekly.week, getCurrentISOWeek(WEDNESDAY));
        assert.ok(isNaN(weekly.offset));
    });
});
