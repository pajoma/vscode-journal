import * as vscode from 'vscode';
import * as J from '../..';
import * as Path from 'path';
import { SCOPE_DEFAULT } from '../../vscode';
import { FileEntry, IConfiguration, ILogger } from '../../model';

export interface DecoratedQuickPickItem extends vscode.QuickPickItem {
    parsedInput?: J.Model.Input;
    replace?: boolean;
    path: string;
    pickItem?: J.Model.JournalPageType;
    fileEntry?: J.Model.FileEntry;
}

export interface TimedQuickPick extends vscode.QuickPick<DecoratedQuickPickItem> {
    start?: number;
}




/**
 * Feature responsible for scanning the journal and notes folders and collecting the items displayed in the picklist
*/
export class ScanEntries {

    private cache: Map<String, J.Model.FileEntry>;
    constructor(private config: IConfiguration, private logger: ILogger) {
        this.cache = new Map();
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
    public async getPreviouslyAccessedFilesSync(thresholdInMs: number, directories: J.Model.ScopeDirectory[]): Promise<J.Model.FileEntry[]> {

        this.logger.trace("Entering getPreviousJournalFilesSync() in actions/reader.ts");

        if (this.cache.size > 0) {
            return Array.from(this.cache.values()).sort(sortPickEntries);
        }

        // go into base directory, find all files changed within the last X days (see config)
        // for each file, check if it is an entry, a note or an attachement
        for (const directory of directories) {
            try {
                await vscode.workspace.fs.stat(vscode.Uri.file(directory.path));
            } catch {
                this.logger.error("Invalid configuration, base directory does not exist with path", directory.path);
                continue;
            }

            await this.walkDir(directory.path, thresholdInMs, (entries: J.Model.FileEntry[]) => {
                entries.forEach(entry => {
                    entry.type = J.Journal.inferType(Path.parse(entry.path), this.config.getFileExtension());
                    entry.scope = directory.scope;
                    this.cache.set(entry.path, entry);
                });
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
    public async getPreviouslyAccessedFiles(thresholdInMs: number, callback: Function, picker: any, type: J.Model.JournalPageType, directories: Set<J.Model.ScopeDirectory>): Promise<void> {

        // go into base directory, find all files changed within the last 40 days
        // for each file, check if it is an entry, a note or an attachement


        this.logger.trace("Entering getPreviouslyAccessedFiles() in actions/reader.ts and number of directories to scan: ", directories.size);

        // Cache short-circuit (#187): if we have already scanned, return cached entries and
        // skip the filesystem walk entirely. Cache is invalidated explicitly via clearCache()
        // — wire workspace file-event listeners through registerInvalidationListeners().
        if (this.cache.size > 0) {
            let cachedEntries: FileEntry[] = Array.from(this.cache.values()).filter(fe => fe.type === type).sort(sortPickEntries);
            callback(cachedEntries, picker, type);
            return;
        }

        // we have to live with duplicates in the set of directories (which also means we have to live with non-deterministic scope resolution)

        // we scan the scopes first
        Array.from(directories)
            .filter(dir => dir.scope !== SCOPE_DEFAULT)
            .forEach(dir => this.scanDirectory(thresholdInMs, callback, picker, type, dir));

        Array.from(directories)
            .filter(dir => dir.scope === SCOPE_DEFAULT)
            .forEach(dir => this.scanDirectory(thresholdInMs, callback, picker, type, dir));
    }

    /**
     * Registers workspace file-create/delete listeners that clear the cache so the next
     * scan re-reads the filesystem. Caller (Startup) owns the returned disposables.
     */
    public registerInvalidationListeners(): vscode.Disposable[] {
        const onCreate = vscode.workspace.onDidCreateFiles(() => this.clearCache());
        const onDelete = vscode.workspace.onDidDeleteFiles(() => this.clearCache());
        const onRename = vscode.workspace.onDidRenameFiles(() => this.clearCache());
        return [onCreate, onDelete, onRename];
    }


    private async scanDirectory(thresholdInMs: number, callback: Function, picker: any, type: J.Model.JournalPageType, directory: J.Model.ScopeDirectory): Promise<void> {
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(directory.path));
        } catch {
            this.logger.error("Invalid configuration, base directory does not exist");
            return;
        }

        await this.walkDir(directory.path, thresholdInMs, (entries: J.Model.FileEntry[]) => {
            entries.forEach(fe => {
                fe.type = J.Journal.inferType(Path.parse(fe.path), this.config.getFileExtension());
                fe.scope = directory.scope;
                if (!this.cache.has(fe.path)) {
                    this.cache.set(fe.path, fe);
                }

            });

            // this adds the items to the quickpick list of vscode (the addItem Function)
            callback(entries, picker, type);
        });
    }




    /**
    * Scans journal directory and scans for notes
    * 
    * Update: Removed age threshold, take everything
    * Update: switched to async with readdir
    * 
    * See https://medium.com/@allenhwkim/nodejs-walk-directory-f30a2d8f038f
    * @param dir 
    * @param callback 
    */
    private async walkDir(dir: string, thresholdInMs: number, callback: Function): Promise<void> {
        let entries: [string, vscode.FileType][];
        try {
            entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
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
            if (type === vscode.FileType.Directory) {
                subdirs.push(childPath);
            } else {
                files.push({ name, childPath });
            }
        }

        const statResults = await Promise.all(
            files.map(async ({ name, childPath }) => {
                try {
                    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(childPath));
                    return {
                        path: childPath,
                        name,
                        updateAt: stat.mtime,
                        accessedAt: stat.mtime, // vscode.FileStat does not expose atime
                        createdAt: stat.ctime
                    } as FileEntry;
                } catch {
                    return undefined;
                }
            })
        );

        const foundFiles: FileEntry[] = statResults.filter((f): f is FileEntry => f !== undefined);
        callback(foundFiles);

        await Promise.all(subdirs.map(d => this.walkDir(d, thresholdInMs, callback)));
    }

    // deprecated — converted to async vscode.workspace.fs for remote compatibility
    private async walkDirSync(dir: string, thresholdDateInMs: number, callback: Function): Promise<void> {
        let entries: [string, vscode.FileType][];
        try {
            entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
        } catch {
            return;
        }

        for (const [name, type] of entries) {
            if (name.startsWith(".")) { continue; }

            const childPath = Path.join(dir, name);
            try {
                const stat = await vscode.workspace.fs.stat(vscode.Uri.file(childPath));

                if (type === vscode.FileType.Directory && stat.mtime > thresholdDateInMs) {
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

export function sortPickEntries(a: FileEntry, b: FileEntry): number {
    return b.updateAt - a.updateAt;

}