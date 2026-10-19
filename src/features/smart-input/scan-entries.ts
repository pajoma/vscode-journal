import * as vscode from 'vscode';
import { getJournalDate, getWeekFromPath, inferType } from '../../shared/paths';
import { FileEntry, IFileSystem, ILogger, JFileType, JournalPageType, ScopeDirectory } from '../../shared/model/index';
import { JournalPaths, JournalScopes, JournalSettings } from 'journal-core';
import * as Path from 'path';
import { SCOPE_DEFAULT } from '../../shared/config/configuration';

/** Receives scanned files, possibly in several batches while the directories are walked. */
export type OnEntries = (entries: FileEntry[]) => void;




/**
 * Feature responsible for scanning the journal and notes folders and collecting the items displayed in the picklist
*/
export class ScanEntries {

    private cache: Map<String, FileEntry>;
    constructor(private config: JournalSettings & JournalScopes & JournalPaths, private logger: ILogger, private fs: IFileSystem) {
        this.cache = new Map();
    }

    /**
     * Weekly entries by the weeks path pattern, also the default one a journal
     * may have used before (their names are not only digits); else by the file name.
     */
    private typeOf(path: string): JournalPageType {
        return getWeekFromPath(path, this.config, { legacy: true })
            ? JournalPageType.weekly
            : inferType(Path.parse(path), { extension: this.config.getFileExtension() });
    }

    /**
     * Discards cached entries so the next scan re-reads the filesystem.
     */
    public clearCache(): void {
        this.cache.clear();
    }



    /**
     * Sync method, not used anymore
     * 
     * @param thresholdInMs 
     * @param directories 
     * @returns 
     */
    public async getPreviouslyAccessedFilesSync(thresholdInMs: number, directories: ScopeDirectory[]): Promise<FileEntry[]> {

        this.logger.trace("Entering getPreviousJournalFilesSync() in actions/reader.ts");

        if (this.cache.size > 0) {
            return Array.from(this.cache.values()).sort(sortPickEntries);
        }

        // go into base directory, find all files changed within the last X days (see config)
        // for each file, check if it is an entry, a note or an attachment
        for (const directory of directories) {
            try {
                await this.fs.stat(directory.path);
            } catch {
                this.logger.error("Invalid configuration, base directory does not exist with path", directory.path);
                continue;
            }

            await this.walkDir(directory.path, directory.scope, thresholdInMs, (entries: FileEntry[]) => {
                entries.forEach(entry => this.cache.set(entry.path, entry));
            });
        }

        return Array.from(this.cache.values());

    }

    /**
     * Loads previous entries. This method is async and is called in combination with the sync method (which uses the threshold)
     * 
     * Will cache the results
     * 
     * Update: ignore threshold
     *
     * @returns {Q.Promise<[string]>}
     * @memberof Reader
     */
    public async getPreviouslyAccessedFiles(thresholdInMs: number, type: JournalPageType, directories: Set<ScopeDirectory>, onEntries: OnEntries): Promise<void> {

        // go into base directory, find all files changed within the last 40 days
        // for each file, check if it is an entry, a note or an attachment


        this.logger.trace("Entering getPreviouslyAccessedFiles() in actions/reader.ts and number of directories to scan: ", directories.size);

        // Cache short-circuit (#187): if we have already scanned, return cached entries and
        // skip the filesystem walk entirely. Cache is invalidated explicitly via clearCache()
        // — wire workspace file-event listeners through registerInvalidationListeners().
        if (this.cache.size > 0) {
            let cachedEntries: FileEntry[] = Array.from(this.cache.values()).filter(fe => fe.type === type).sort(sortPickEntries);
            onEntries(cachedEntries);
            return;
        }

        // we have to live with duplicates in the set of directories (which also means we have to live with non-deterministic scope resolution)

        // we scan the scopes first
        Array.from(directories)
            .filter(dir => dir.scope !== SCOPE_DEFAULT)
            .forEach(dir => this.scanDirectory(thresholdInMs, dir, onEntries));

        Array.from(directories)
            .filter(dir => dir.scope === SCOPE_DEFAULT)
            .forEach(dir => this.scanDirectory(thresholdInMs, dir, onEntries));
    }

    /**
     * Registers workspace file-create/delete listeners that clear the cache so the next
     * scan re-reads the filesystem. Caller (Startup) owns the returned disposables.
     */
    public registerInvalidationListeners(): vscode.Disposable[] {
        const onCreate = vscode.workspace.onDidCreateFiles(() => this.clearCache());
        const onDelete = vscode.workspace.onDidDeleteFiles(() => this.clearCache());
        const onRename = vscode.workspace.onDidRenameFiles(() => this.clearCache());
        // base paths, patterns or scopes may point to other directories now
        const onConfig = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('journal')) { this.clearCache(); }
        });
        return [onCreate, onDelete, onRename, onConfig];
    }


    private async scanDirectory(thresholdInMs: number, directory: ScopeDirectory, onEntries: OnEntries): Promise<void> {
        try {
            await this.fs.stat(directory.path);
        } catch {
            this.logger.error("Invalid configuration, base directory does not exist");
            return;
        }

        await this.walkDir(directory.path, directory.scope, thresholdInMs, (entries: FileEntry[]) => {
            entries.forEach(fe => {
                if (!this.cache.has(fe.path)) {
                    this.cache.set(fe.path, fe);
                }

            });

            onEntries(entries);
        });
    }




    /**
    * Scans journal directory and scans for notes
    * 
    * Update: Removed age threshold, take everything
    * Update: switched to async with readdir
    * 
    * See https://medium.com/@allenhwkim/nodejs-walk-directory-f30a2d8f038f
    * Each entry is complete when it is found: type, scope and the day it
    * belongs to (#300) are decided here, once.
    * 
    * @param dir 
    * @param scope the scope the directory belongs to
    * @param callback 
    */
    private async walkDir(dir: string, scope: string, thresholdInMs: number, callback: Function): Promise<void> {
        let entries: [string, JFileType][];
        try {
            entries = await this.fs.readDirectory(dir);
        } catch {
            return; // ignore errors
        }

        // Partition into files (need stat) and subdirectories (need recursion). Issue #187:
        // stat calls are fanned out per directory level so remote filesystems do not pay
        // sequential round-trip latency for every file.
        const files: { name: string; childPath: string }[] = [];
        const subdirs: string[] = [];

        for (const [name, type] of entries) {
            if (name.startsWith(".")) { continue; }
            const childPath = Path.join(dir, name);
            if (type === JFileType.Directory) {
                subdirs.push(childPath);
            } else {
                files.push({ name, childPath });
            }
        }

        const statResults = await Promise.all(
            files.map(async ({ name, childPath }) => {
                try {
                    const stat = await this.fs.stat(childPath);
                    const entry: FileEntry = {
                        path: childPath,
                        name,
                        scope,
                        type: this.typeOf(childPath),
                        updateAt: stat.mtime,
                        accessedAt: stat.mtime,
                        createdAt: stat.ctime,
                        journalDate: getJournalDate(childPath, stat.ctime, scope, this.config).getTime(),
                    };
                    return entry;
                } catch {
                    return undefined;
                }
            })
        );

        const foundFiles: FileEntry[] = statResults.filter((f): f is FileEntry => f !== undefined);
        callback(foundFiles);

        await Promise.all(subdirs.map(d => this.walkDir(d, scope, thresholdInMs, callback)));
    }

    // deprecated — use walkDir instead
    private async walkDirSync(dir: string, thresholdDateInMs: number, callback: Function): Promise<void> {
        let entries: [string, JFileType][];
        try {
            entries = await this.fs.readDirectory(dir);
        } catch {
            return;
        }

        for (const [name, type] of entries) {
            if (name.startsWith(".")) { continue; }

            const childPath = Path.join(dir, name);
            try {
                const stat = await this.fs.stat(childPath);

                if (type === JFileType.Directory && stat.mtime > thresholdDateInMs) {
                    await this.walkDirSync(childPath, thresholdDateInMs, callback);
                } else if (stat.mtime > thresholdDateInMs) {
                    callback(new Array({
                        path: childPath,
                        name: name,
                        updatedAt: stat.mtime,
                        accessedAt: stat.mtime,
                        createdAt: stat.ctime
                    }));
                }
            } catch {
                // skip files we can't stat
            }
        }
    }
}

/**
 * Newest first by the day a file belongs to (#300), not by its modification
 * time: a copied or cloned journal has the copy's modification times, and
 * editing an old note must not move it to the top (#279).
 */
export function sortPickEntries(a: FileEntry, b: FileEntry): number {
    return b.journalDate - a.journalDate || a.name.localeCompare(b.name);

}