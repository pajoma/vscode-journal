'use strict';

import { IFileSystem, JFileStat, JFileType } from '../model';

function notFound(path: string): never {
    const err = new Error(`FileNotFound: ${path}`) as NodeJS.ErrnoException & { code: string };
    err.code = 'FileNotFound';
    throw err;
}

export class InMemoryFileSystem implements IFileSystem {
    private files = new Map<string, Uint8Array>();
    private dirs = new Map<string, [string, JFileType][]>();

    addDirectory(path: string, entries: [string, JFileType][] = []): this {
        this.dirs.set(path, entries);
        return this;
    }

    getWrittenContent(path: string): Uint8Array | undefined {
        return this.files.get(path);
    }

    async stat(path: string): Promise<JFileStat> {
        if (this.files.has(path)) {
            return { type: JFileType.File, ctime: 0, mtime: 0, size: this.files.get(path)!.byteLength };
        }
        if (this.dirs.has(path)) {
            return { type: JFileType.Directory, ctime: 0, mtime: 0, size: 0 };
        }
        notFound(path);
    }

    async readFile(path: string): Promise<Uint8Array> {
        const data = this.files.get(path);
        if (data === undefined) { notFound(path); }
        return data;
    }

    async writeFile(path: string, content: Uint8Array): Promise<void> {
        this.files.set(path, content);
    }

    async readDirectory(path: string): Promise<[string, JFileType][]> {
        const entries = this.dirs.get(path);
        if (entries === undefined) { notFound(path); }
        return entries;
    }

    async createDirectory(path: string): Promise<void> {
        if (!this.dirs.has(path)) { this.dirs.set(path, []); }
    }

    async delete(path: string, _options?: { recursive?: boolean }): Promise<void> {
        if (!this.files.delete(path) && !this.dirs.delete(path)) { notFound(path); }
    }
}
