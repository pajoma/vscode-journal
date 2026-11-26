import * as assert from 'assert';
import { dayOfExpression } from 'journal-core';

// Wednesday, 2026-11-25 (local time)
const TODAY = new Date(2026, 10, 25);
const iso = (d: Date | undefined) => d && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (value: string, locale = 'en') => iso(dayOfExpression(value, TODAY, locale));

suite('dayOfExpression — the smart input dates for the MCP server', () => {
    test('shortcuts and offsets', () => {
        assert.strictEqual(day('today'), '2026-11-25');
        assert.strictEqual(day('tomorrow'), '2026-11-26');
        assert.strictEqual(day('yesterday'), '2026-11-24');
        assert.strictEqual(day('+7'), '2026-12-02');
        assert.strictEqual(day('-30'), '2026-10-26');
    });

    test('weekdays with and without modifier', () => {
        assert.strictEqual(day('friday'), '2026-11-27');
        assert.strictEqual(day('monday'), '2026-11-23');
        assert.strictEqual(day('next monday'), '2026-11-30');
        assert.strictEqual(day('last friday'), '2026-11-20');
        assert.strictEqual(day('nächsten freitag', 'de'), undefined);
        assert.strictEqual(day('next freitag', 'de'), '2026-11-27');
    });

    test('dates without year and month names', () => {
        assert.strictEqual(day('12-24'), '2026-12-24');
        assert.strictEqual(day('2027-01-05'), '2027-01-05');
        assert.strictEqual(day('dec 24'), '2026-12-24');
        assert.strictEqual(day('3'), '2026-11-03');
    });

    test('a week names its first day in the journal locale', () => {
        assert.strictEqual(day('next week', 'de'), '2026-11-30');
        assert.strictEqual(day('w1', 'de'), '2025-12-29');
    });

    test('anything but a date expression is undefined', () => {
        assert.strictEqual(day('next friday call'), undefined);
        assert.strictEqual(day('soon'), undefined);
        assert.throws(() => dayOfExpression('13-01', TODAY, 'en'), /month/);
    });
});
