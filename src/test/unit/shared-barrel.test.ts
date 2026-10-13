import * as assert from 'assert';
// plain node has no "vscode" module: if the barrel loaded it, this file would fail to load
import * as shared from '../../shared/index';

/** The shared/ barrel holds only helpers that run without VS Code; the logger is not part of it (#281). */
suite('shared/ barrel', () => {
    test('loads without vscode', () => {
        assert.strictEqual(typeof shared.isNullOrUndefined, 'function');
        assert.strictEqual(typeof shared.fileExists, 'function');
        assert.ok(!('ConsoleLogger' in shared) && !('Logger' in shared), 'the logger is imported from shared/logging/logger');
    });
});
