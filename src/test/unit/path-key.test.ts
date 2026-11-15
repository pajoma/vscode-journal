import * as assert from 'assert';
import { isInside, pathKey } from '../../shared/paths';

/** Comparing paths of the configuration and of VS Code (#327: drive letter in any case). */
suite('pathKey', () => {

    test('the drive letter and the separators do not count', () => {
        assert.strictEqual(pathKey('C:\\Users\\me\\Journal\\scopes\\acme\\Plan.md'), pathKey('c:/Users/me/Journal/scopes/acme/Plan.md'));
        assert.strictEqual(pathKey('/home/me/Journal/'), '/home/me/Journal');
        assert.strictEqual(pathKey('/'), '/');
    });

    test('a file is inside a folder, whatever the case of the drive letter', () => {
        assert.ok(isInside('c:\\Users\\me\\Journal\\scopes\\acme\\Plan.md', 'C:\\Users\\me\\Journal\\scopes\\acme'));
        assert.ok(isInside('/home/me/Journal/scopes/acme/Plan.md', '/home/me/Journal/scopes/acme/'));
        assert.ok(!isInside('/home/me/Journal/scopes/acme-two/Plan.md', '/home/me/Journal/scopes/acme'));
        assert.ok(!isInside('/home/me/Journal/scopes/acme', '/home/me/Journal/scopes/acme'));
    });
});
