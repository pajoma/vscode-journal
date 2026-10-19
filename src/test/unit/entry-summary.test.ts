import * as assert from 'assert';
import { entrySummary } from 'journal-core';

const ENTRY = [
    '# Monday, October 19 2026',
    '',
    '## Tasks',
    '- [ ] Review PR',
    '- [x] Write minutes (done: 2026-10-19 10:00)',
    '  - [ ] send them around',
    '- [>] Plan sprint (moved: [Tuesday](./20.md))',
    '* [] older template task',
    '- [ ] ',
    '',
    '## Notes',
    '- NOTE: [Konzept](./19/Konzept.md)',
    '- NOTE: [(.pdf) Offer](./19/Offer%20v2.pdf)',
    '- again: [Konzept](./19/Konzept.md)',
    '- [VS Code](https://code.visualstudio.com) [mail](mailto:a@example.com) [top](#tasks)',
].join('\r\n');

/** The counts next to an entry in the entry picker (#7). */
suite('Entry summary (journal-core, #7)', () => {

    test('open and done tasks, sub-tasks included; moved tasks and empty placeholders not counted', () => {
        const { open, tasks } = entrySummary(ENTRY);
        assert.strictEqual(tasks, 4);
        assert.strictEqual(open, 3);
    });

    test('distinct local files, not web, mail or anchor links', () => {
        // ./20.md of the moved task is a local file too, unless isNote says otherwise
        assert.strictEqual(entrySummary(ENTRY).notes, 3);
    });

    test('isNote leaves out links that are no notes, e.g. to other entries', () => {
        const seen: string[] = [];
        const { notes } = entrySummary(ENTRY, target => { seen.push(target); return target !== './20.md'; });
        assert.strictEqual(notes, 2);
        assert.ok(seen.includes('./19/Offer v2.pdf'), 'targets are decoded');
    });

    test('an empty entry has nothing', () => {
        assert.deepStrictEqual(entrySummary(''), { open: 0, tasks: 0, notes: 0 });
    });
});
