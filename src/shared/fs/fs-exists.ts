'use strict';

import { IFileSystem } from '../model/index';

// Returns true if the path resolves to an existing entry on the filesystem,
// false if it definitely does not exist, and rethrows for any other FS error.
export async function fileExists(fs: IFileSystem, path: string): Promise<boolean> {
    try {
        await fs.stat(path);
        return true;
    } catch (err: unknown) {
        if (isFileNotFound(err)) { return false; }
        throw err;
    }
}

export function isFileNotFound(err: unknown): boolean {
    return (
        typeof err === 'object' && err !== null &&
        (err as { code?: string }).code === 'FileNotFound'
    );
}
