'use strict';

import * as assert from 'assert';
import * as path from 'path';
import { Writer } from '../../features/entries/writer';
import { InMemoryFileSystem } from '../in-memory-fs';
import { TestLogger } from '../test-logger';
import { IConfiguration, IEditor, IInject } from '../../shared/model/index';

suite('writer-unit — Writer with InMemoryFileSystem', () => {

    function makeWriter(fs: InMemoryFileSystem): Writer {
        const stubInject: Partial<IInject> = {};
        const stubConfig: Partial<IConfiguration> = {};
        // Stub editor mirrors EditorAdapter.createAndOpen: write to the in-memory
        // fs, then return a fake document (no real Extension Host open).
        const stubEditor: IEditor = {
            open: async (p: any) => ({ fileName: String(p), uri: { fsPath: String(p) } } as any),
            save: async (doc: any) => doc,
            createAndOpen: async (p: string, content: string) => {
                await fs.writeFile(p, new TextEncoder().encode(content));
                return { fileName: p, uri: { fsPath: p } } as any;
            },
            applyInlineStrings: async (content: any) => content.document,
        };
        return new Writer(
            stubConfig as IConfiguration,
            new TestLogger(false),
            stubInject as IInject,
            stubEditor,
        );
    }

    test('createSaveLoadTextDocument writes content to the given path', async () => {
        const fs = new InMemoryFileSystem();
        const writer = makeWriter(fs);
        const targetPath = path.join('/tmp', `writer-unit-${Date.now()}.md`);
        const content = '# Test entry\n';

        await writer.createSaveLoadTextDocument(targetPath, content);

        const written = fs.getWrittenContent(targetPath);
        assert.ok(written, 'expected content to be written to InMemoryFileSystem');
        assert.strictEqual(new TextDecoder().decode(written), content);
    });

    test('createSaveLoadTextDocument with empty content writes empty bytes', async () => {
        const fs = new InMemoryFileSystem();
        const writer = makeWriter(fs);
        const targetPath = path.join('/tmp', `writer-unit-empty-${Date.now()}.md`);

        await writer.createSaveLoadTextDocument(targetPath, '');

        const written = fs.getWrittenContent(targetPath);
        assert.ok(written !== undefined, 'expected writeFile to be called even for empty content');
        assert.strictEqual(written.byteLength, 0);
    });

    test('createSaveLoadTextDocument returns document at the correct path', async () => {
        const fs = new InMemoryFileSystem();
        const writer = makeWriter(fs);
        const targetPath = `/tmp/writer-unit-doc-${Date.now()}.md`;

        const doc = await writer.createSaveLoadTextDocument(targetPath, '# Hello\n');

        assert.ok(doc, 'expected a document to be returned');
        assert.strictEqual(doc.uri.fsPath, targetPath);
    });
});
