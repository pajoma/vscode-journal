'use strict';

import * as fs from 'fs/promises';
import { IFileSystem, JFileStat, JFileType } from '../shared/model/index';

/** The real file system through node's fs, for unit tests that walk folders (no VS Code). */
export class NodeFileSystem implements IFileSystem {

    async stat(path: string): Promise<JFileStat> {
        const stat = await fs.stat(path).catch(notFound);
        return { type: stat.isDirectory() ? JFileType.Directory : JFileType.File, ctime: stat.ctimeMs, mtime: stat.mtimeMs, size: stat.size };
    }

    async readFile(path: string): Promise<Uint8Array> {
        return fs.readFile(path).catch(notFound);
    }

    async writeFile(path: string, content: Uint8Array): Promise<void> {
        await fs.writeFile(path, content);
    }

    async readDirectory(path: string): Promise<[string, JFileType][]> {
        const entries = await fs.readdir(path, { withFileTypes: true }).catch(notFound);
        return entries.map(entry => [entry.name, entry.isDirectory() ? JFileType.Directory : JFileType.File]);
    }

    async createDirectory(path: string): Promise<void> {
        await fs.mkdir(path, { recursive: true });
    }

    /** Like workspace.fs.delete: an empty folder needs no `recursive`. */
    async delete(path: string, options?: { recursive?: boolean }): Promise<void> {
        if (!options?.recursive && (await fs.stat(path)).isDirectory()) {
            await fs.rmdir(path);
        } else {
            await fs.rm(path, { recursive: options?.recursive ?? false });
        }
    }

    async rename(from: string, to: string): Promise<void> {
        if (await fs.stat(to).then(() => true, () => false)) { throw new Error(`FileExists: ${to}`); }
        await fs.rename(from, to);
    }
}

/** As workspace.fs reports a missing file: the code 'FileNotFound' (see isFileNotFound). */
function notFound(error: NodeJS.ErrnoException): never {
    throw error.code === 'ENOENT' ? Object.assign(error, { code: 'FileNotFound' }) : error;
}
