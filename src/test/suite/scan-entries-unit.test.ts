'use strict';

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { JournalScan, ScanEntries } from '../../features/smart-input/scan-entries';
import { NodeFileSystem } from '../node-fs';
import { TestLogger } from '../test-logger';
import { JournalPageType, SCOPE_DEFAULT } from '../../shared/model/index';
import { Configuration } from '../../shared/config/configuration';
import { FakeWorkspaceConfig } from '../fake-workspace-config';
import { JournalFiles, scanJournalFiles } from '../../shared/journal/journal-files';

/** The lists of the smart input are built from the journal's one scan (#320). */
suite('scan-entries-unit — ScanEntries over the journal scan', () => {
    let base: string;
    let scans: number;

    setup(() => {
        base = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-scan-'));
        scans = 0;
    });
    teardown(() => fs.rmSync(base, { recursive: true, force: true }));

    function write(...files: string[]): void {
        for (const file of files) {
            fs.mkdirSync(path.dirname(path.join(base, file)), { recursive: true });
            fs.writeFileSync(path.join(base, file), '# x\n');
        }
    }

    function makeScanner(settings: Record<string, unknown> = {}): { scanner: ScanEntries; scan: JournalScan } {
        const config = new Configuration(new FakeWorkspaceConfig({
            base,
            patterns: { weeks: { path: '${base}/${year}', file: '${year}-w${week}.${ext}' } },
            ...settings,
        }));
        const nodeFs = new NodeFileSystem();
        let files: Promise<JournalFiles> | undefined;
        const scan: JournalScan = {
            get: () => { files ??= (scans++, scanJournalFiles(nodeFs, config)); return files; },
            invalidate: () => { files = undefined; },
        };
        return { scanner: new ScanEntries(config, new TestLogger(false), nodeFs, () => scan), scan };
    }

    const byName = async (scanner: ScanEntries) => Object.fromEntries((await scanner.getFiles()).map(e => [path.basename(e.path), e.type]));

    test('daily entries, weekly entries, notes and attachments, as wiki links and the calendar see them (#299)', async () => {
        write('2026/10/18.md', '2026/2026-w42.md', '2026/10/18/Planning w42.md', '2026/10/18/slides.pdf');
        assert.deepStrictEqual(await byName(makeScanner().scanner), {
            '18.md': JournalPageType.entry,
            '2026-w42.md': JournalPageType.weekly,
            'Planning w42.md': JournalPageType.note,
            'slides.pdf': JournalPageType.attachment,
        });
    });

    test('hidden files are skipped; a journal folder that does not exist yet has no files', async () => {
        write('2025/04/01.md', '2025/04/.hidden.md');
        assert.deepStrictEqual(Object.keys(await byName(makeScanner().scanner)), ['01.md']);
        fs.rmSync(base, { recursive: true, force: true });
        assert.deepStrictEqual(await makeScanner().scanner.getFiles(), []);
    });

    test('the lists of one scan are built once; clearCache scans again (#187)', async () => {
        write('2025/05/01.md');
        const { scanner } = makeScanner();
        const first = await scanner.getFiles();
        write('2025/05/02.md');
        assert.strictEqual(await scanner.getFiles(), first, 'the same list, no new scan');
        assert.strictEqual(scans, 1);

        scanner.clearCache();
        assert.strictEqual((await scanner.getFiles()).length, 2, 'the new file after a new scan');
        assert.strictEqual(scans, 2);
    });

    test('the files of a type, newest first by the day they belong to', async () => {
        write('2025/05/01.md', '2025/05/03.md', '2025/05/02.md', '2025/05/02/Note.md');
        let listed: string[] = [];
        await makeScanner().scanner.getPreviouslyAccessedFiles(JournalPageType.entry, entries => { listed = entries.map(e => path.basename(e.path)); });
        assert.deepStrictEqual(listed, ['03.md', '02.md', '01.md']);
    });

    test('each file carries the day it belongs to, not the creation date of the copy (#300)', async () => {
        write('2019/03/14/Kickoff.md');
        const [entry] = await makeScanner().scanner.getFiles();
        assert.deepStrictEqual([entry.journalDate, entry.scope, entry.type], [new Date(2019, 2, 14).getTime(), SCOPE_DEFAULT, JournalPageType.note]);
    });

    test('notes of a scope with its own base carry the scope', async () => {
        write('2026/10/20.md', 'client/2026/10/20/Offer.md');
        const { scanner } = makeScanner({ scopes: [{ name: 'client', base: path.join(base, 'client') }] });
        const offer = (await scanner.getFiles()).find(e => e.name === 'Offer.md')!;
        assert.deepStrictEqual([offer.type, offer.scope], [JournalPageType.note, 'client']);
    });
});
