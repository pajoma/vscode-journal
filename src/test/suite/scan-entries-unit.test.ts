'use strict';

import * as assert from 'assert';
import * as path from 'path';
import { ScanEntries } from '../../features/smart-input/scan-entries';
import { InMemoryFileSystem } from '../in-memory-fs';
import { TestLogger } from '../test-logger';
import { JFileType, JournalPageType, SCOPE_DEFAULT, ScopeDirectory } from '../../shared/model/index';
import { Configuration } from '../../shared/config/configuration';
import { FakeWorkspaceConfig } from '../fake-workspace-config';

function makeScanner(fs: InMemoryFileSystem): ScanEntries {
    const config = new Configuration(new FakeWorkspaceConfig({
        base: '/journal',
        patterns: { weeks: { path: '${base}/${year}', file: '${year}-w${week}.${ext}' } },
    }));
    return new ScanEntries(config, new TestLogger(false), fs);
}

suite('scan-entries-unit — ScanEntries with InMemoryFileSystem', () => {

    test('getPreviouslyAccessedFilesSync finds files in a flat directory', async () => {
        const base = '/journal/2025/03';
        const fs = new InMemoryFileSystem()
            .addDirectory('/journal', [['2025', JFileType.Directory]])
            .addDirectory('/journal/2025', [['03', JFileType.Directory]])
            .addDirectory(base, [
                ['05.md', JFileType.File],
                ['08.md', JFileType.File],
            ]);
        fs.getWrittenContent; // satisfy linter

        // Pre-populate the files so stat() works
        await fs.writeFile(path.join(base, '05.md'), new TextEncoder().encode('# Entry\n'));
        await fs.writeFile(path.join(base, '08.md'), new TextEncoder().encode('# Entry\n'));

        const scanner = makeScanner(fs);
        const dirs: ScopeDirectory[] = [{ path: base, scope: SCOPE_DEFAULT }];
        const results = await scanner.getPreviouslyAccessedFilesSync(Date.now(), dirs);

        assert.strictEqual(results.length, 2, `expected 2 entries, got ${results.length}`);
        const names = results.map(e => path.basename(e.path)).sort();
        assert.deepStrictEqual(names, ['05.md', '08.md']);
    });

    test('getPreviouslyAccessedFilesSync skips non-existent base directory without throwing', async () => {
        const fs = new InMemoryFileSystem(); // no directories added
        const scanner = makeScanner(fs);
        const dirs: ScopeDirectory[] = [{ path: '/nonexistent', scope: SCOPE_DEFAULT }];

        const results = await scanner.getPreviouslyAccessedFilesSync(Date.now(), dirs);

        assert.strictEqual(results.length, 0);
    });

    test('getPreviouslyAccessedFilesSync ignores dot-prefixed entries', async () => {
        const base = '/journal/2025/04';
        const fs = new InMemoryFileSystem()
            .addDirectory(base, [
                ['.hidden', JFileType.File],
                ['01.md', JFileType.File],
            ]);
        await fs.writeFile(path.join(base, '.hidden'), new TextEncoder().encode(''));
        await fs.writeFile(path.join(base, '01.md'), new TextEncoder().encode('# Entry\n'));

        const scanner = makeScanner(fs);
        const results = await scanner.getPreviouslyAccessedFilesSync(Date.now(), [{ path: base, scope: SCOPE_DEFAULT }]);

        assert.strictEqual(results.length, 1);
        assert.ok(path.basename(results[0].path) === '01.md');
    });

    test('results are cached on second call without re-walking', async () => {
        const base = '/journal/2025/05';
        const fs = new InMemoryFileSystem()
            .addDirectory(base, [['01.md', JFileType.File]]);
        await fs.writeFile(path.join(base, '01.md'), new TextEncoder().encode('# Entry\n'));

        const scanner = makeScanner(fs);
        const dirs: ScopeDirectory[] = [{ path: base, scope: SCOPE_DEFAULT }];

        const first = await scanner.getPreviouslyAccessedFilesSync(Date.now(), dirs);
        // mutate the fs after first scan — second call should still return cached
        await fs.writeFile(path.join(base, '02.md'), new TextEncoder().encode('# New\n'));

        const second = await scanner.getPreviouslyAccessedFilesSync(Date.now(), dirs);
        assert.strictEqual(second.length, first.length, 'cache should prevent re-scan');
    });

    test('weekly entries are neither notes nor entries (#299)', async () => {
        const year = '/journal/2026';
        const day = '/journal/2026/10/18';
        const fs = new InMemoryFileSystem()
            .addDirectory('/journal', [['2026', JFileType.Directory]])
            .addDirectory(year, [['2026-w42.md', JFileType.File], ['10', JFileType.Directory]])
            .addDirectory('/journal/2026/10', [['18.md', JFileType.File], ['18', JFileType.Directory]])
            .addDirectory(day, [['Planning w42.md', JFileType.File]]);
        for (const file of [path.join(year, '2026-w42.md'), '/journal/2026/10/18.md', path.join(day, 'Planning w42.md')]) {
            await fs.writeFile(file, new TextEncoder().encode('# x\n'));
        }

        const results = await makeScanner(fs).getPreviouslyAccessedFilesSync(Date.now(), [{ path: '/journal', scope: SCOPE_DEFAULT }]);
        const types = Object.fromEntries(results.map(e => [path.basename(e.path), e.type]));
        assert.deepStrictEqual(types, {
            '2026-w42.md': JournalPageType.weekly,
            '18.md': JournalPageType.entry,
            'Planning w42.md': JournalPageType.note,
        });
    });
});
