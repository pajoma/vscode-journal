'use strict';

import * as assert from 'assert';
import * as path from 'path';
import { ScanEntries } from '../../shared/scan/scan-entries';
import { InMemoryFileSystem } from '../in-memory-fs';
import { TestLogger } from '../test-logger';
import { IConfiguration, JFileType, SCOPE_DEFAULT, ScopeDirectory } from '../../shared/model/index';

function makeScanner(fs: InMemoryFileSystem): ScanEntries {
    const stubConfig: Partial<IConfiguration> = {
        getFileExtension: () => 'md',
    };
    return new ScanEntries(stubConfig as IConfiguration, new TestLogger(false), fs);
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
});
