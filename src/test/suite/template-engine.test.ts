import * as assert from 'assert';
import { resolveDate, toMomentFormat } from '../../shared/templates/template-engine';

const KNOWN_DATE = new Date(2024, 2, 5, 14, 30, 0); // 2024-03-05 14:30

suite('TemplateEngine', () => {

    suite('resolveDate — named variables', () => {
        test('replaces ${year}', () => {
            assert.strictEqual(resolveDate('${year}', KNOWN_DATE), '2024');
        });
        test('replaces ${month}', () => {
            assert.strictEqual(resolveDate('${month}', KNOWN_DATE), '03');
        });
        test('replaces ${day}', () => {
            assert.strictEqual(resolveDate('${day}', KNOWN_DATE), '05');
        });
        test('replaces ${weekday}', () => {
            assert.strictEqual(resolveDate('${weekday}', KNOWN_DATE), 'Tuesday');
        });
        test('replaces ${week}', () => {
            assert.strictEqual(resolveDate('${week}', KNOWN_DATE), '10');
        });
        test('replaces multiple variables in one pass', () => {
            assert.strictEqual(resolveDate('${year}/${month}/${day}', KNOWN_DATE), '2024/03/05');
        });
    });

    suite('resolveDate — custom format', () => {
        test('replaces ${d:YY} with two-digit year', () => {
            assert.strictEqual(resolveDate('year: ${d:YY}', KNOWN_DATE), 'year: 24');
        });
        test('replaces ${d:dddd} with full weekday name', () => {
            assert.strictEqual(resolveDate('${d:dddd}', KNOWN_DATE), 'Tuesday');
        });
    });

    suite('resolveDate — edge cases', () => {
        test('returns template unchanged when no variables', () => {
            assert.strictEqual(resolveDate('no variables here', KNOWN_DATE), 'no variables here');
        });
        test('locale isolation: two calls with different locales do not bleed', () => {
            const de = resolveDate('${weekday}', KNOWN_DATE, 'de');
            const en = resolveDate('${weekday}', KNOWN_DATE, 'en');
            assert.strictEqual(de, 'Dienstag');
            assert.strictEqual(en, 'Tuesday');
            // third call without locale should not inherit 'de'
            const neutral = resolveDate('${weekday}', KNOWN_DATE);
            assert.strictEqual(neutral, en);
        });
    });

    suite('toMomentFormat — named variables', () => {
        test('maps ${year} to YYYY', () => {
            assert.strictEqual(toMomentFormat('${year}'), 'YYYY');
        });
        test('maps ${month} to MM', () => {
            assert.strictEqual(toMomentFormat('${month}'), 'MM');
        });
        test('maps ${day} to DD', () => {
            assert.strictEqual(toMomentFormat('${day}'), 'DD');
        });
        test('maps ${localTime} to LT', () => {
            assert.strictEqual(toMomentFormat('${localTime}'), 'LT');
        });
        test('maps ${localDate} to LL', () => {
            assert.strictEqual(toMomentFormat('${localDate}'), 'LL');
        });
        test('maps ${weekday} to dddd', () => {
            assert.strictEqual(toMomentFormat('${weekday}'), 'dddd');
        });
        test('maps ${week} to w — fixes the prior gap', () => {
            assert.strictEqual(toMomentFormat('${week}'), 'w');
        });
        test('handles mixed template', () => {
            assert.strictEqual(toMomentFormat('${year}/${month}/${day}'), 'YYYY/MM/DD');
        });
    });

    suite('toMomentFormat — custom format passthrough', () => {
        test('passes ${d:YY} through as YY', () => {
            assert.strictEqual(toMomentFormat('${d:YY}'), 'YY');
        });
        test('passes ${d:dddd} through as dddd', () => {
            assert.strictEqual(toMomentFormat('${d:dddd}'), 'dddd');
        });
    });

    suite('toMomentFormat — edge cases', () => {
        test('returns template unchanged when no variables', () => {
            assert.strictEqual(toMomentFormat('no variables'), 'no variables');
        });
    });
});
