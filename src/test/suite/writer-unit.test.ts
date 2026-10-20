'use strict';

import * as assert from 'assert';
import * as path from 'path';
import { Writer } from '../../features/entries/writer';
import { InMemoryFileSystem } from '../in-memory-fs';
import { TestLogger } from '../test-logger';
import { IConfiguration } from '../../shared/model/index';

suite('writer-unit — Writer with InMemoryFileSystem', () => {

    function makeWriter(fs: InMemoryFileSystem): Writer {
        const stubConfig: Partial<IConfiguration> = {};
        return new Writer(stubConfig as IConfiguration, new TestLogger(false), fs);
    }

    test('createFile writes content to the given path', async () => {
        const fs = new InMemoryFileSystem();
        const writer = makeWriter(fs);
        const targetPath = path.join('/tmp', `writer-unit-${Date.now()}.md`);
        const content = '# Test entry\n';

        await writer.createFile(targetPath, content);

        const written = fs.getWrittenContent(targetPath);
        assert.ok(written, 'expected content to be written to InMemoryFileSystem');
        assert.strictEqual(new TextDecoder().decode(written), content);
    });

    test('createFile with empty content writes empty bytes', async () => {
        const fs = new InMemoryFileSystem();
        const writer = makeWriter(fs);
        const targetPath = path.join('/tmp', `writer-unit-empty-${Date.now()}.md`);

        await writer.createFile(targetPath, '');

        const written = fs.getWrittenContent(targetPath);
        assert.ok(written !== undefined, 'expected writeFile to be called even for empty content');
        assert.strictEqual(written.byteLength, 0);
    });

    test('createFile returns the path of the file', async () => {
        const fs = new InMemoryFileSystem();
        const writer = makeWriter(fs);
        const targetPath = `/tmp/writer-unit-doc-${Date.now()}.md`;

        assert.strictEqual(await writer.createFile(targetPath, '# Hello\n'), targetPath);
    });
});
