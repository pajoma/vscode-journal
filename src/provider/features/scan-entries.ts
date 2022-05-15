import * as vscode from 'vscode';
import * as J from '../..';
import * as fs from 'fs';
import * as Path from 'path';
import { SCOPE_DEFAULT } from '../../ext';
import { DecoratedQuickPickItem, FileEntry } from '../../model';




/**
 * Feature responsible for scanning the journal and notes folders and collecting the items displayed in the picklist
*/
export class ScanEntries {

    private cache: Map<String, J.Model.FileEntry>;
    constructor(public ctrl: J.Util.Ctrl) {
        this.cache = new Map();
    }



    /**
     * Sync method, not used anymore
     * 
     * @param thresholdInMs 
     * @param directories 
     * @returns 
     */
    public getPreviouslyAccessedFilesSync(thresholdInMs: number, directories: J.Model.ScopeDirectory[]): Promise<J.Model.FileEntry[]> {

        return new Promise<J.Model.FileEntry[]>((resolve, reject) => {
            try {

                this.ctrl.logger.trace("Entering getPreviousJournalFilesSync() in actions/reader.ts");

                if (this.cache.size > 0) {
                    resolve(Array.from(this.cache.values()).sort(sortPickEntries));
                }

                // go into base directory, find all files changed within the last X days (see config)
                // for each file, check if it is an entry, a note or an attachement
                directories.forEach(directory => {
                    if (!fs.existsSync(directory.path)) {
                        this.ctrl.logger.error("Invalid configuration, base directory does not exist with path", directory.path);
                        return;
                    }

                    this.walkDirSync(directory.path, thresholdInMs, (entry: J.Model.FileEntry) => {
                        /*if (this.previousEntries.findIndex(e => e.path.startsWith(entry.path)) == -1) {
                            this.inferType(entry);
                          //  this.previousEntries.push(entry);
                        }*/
                        entry.type = J.Util.inferType(Path.parse(entry.path), this.ctrl.config.getFileExtension());
                        entry.scope = directory.scope;
                        this.cache.set(entry.path, entry);
                    });
                });


                resolve(Array.from(this.cache.values()));
            } catch (error) {
                reject(error);
            }

        });


        /*
        
            */

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


        this.ctrl.logger.trace("Entering getPreviouslyAccessedFiles() in actions/reader.ts and number of directories to scan: ", directories.size);

        // we add everything from the cache 
        if (this.cache.size > 0) {
            let cachedEntries: FileEntry[] = Array.from(this.cache.values()).filter(fe => fe.type === type).sort(sortPickEntries);
            callback(cachedEntries, picker, type);
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


    private async scanDirectory(thresholdInMs: number, callback: Function, picker: any, type: J.Model.JournalPageType, directory: J.Model.ScopeDirectory): Promise<void> {
        if (!fs.existsSync(directory.path)) {
            this.ctrl.logger.error("Invalid configuration, base directory does not exist");
            return;
        }

        this.walkDir(directory.path, thresholdInMs, (entries: J.Model.FileEntry[]) => {
            entries.forEach(fe => {
                fe.type = J.Util.inferType(Path.parse(fe.path), this.ctrl.config.getFileExtension());
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
        fs.readdir(dir, (err, files) => {
            // we ignore errors here
            const foundFiles: FileEntry[] = [];

            files.forEach(f => {
                let dirPath = Path.join(dir, f);
                let stats: fs.Stats = fs.statSync(dirPath);
                if (f.startsWith(".")) {return;}
                if (stats.isDirectory()) {

                    this.walkDir(dirPath, thresholdInMs, callback);

                } else {
                    
                    foundFiles.push({
                        path: Path.join(dir, f),
                        name: f,
                        updateAt: stats.mtime.getTime(),
                        accessedAt: stats.atime.getTime(),
                        createdAt: stats.birthtime.getTime()
                    });
                }
            });

            callback(foundFiles);

        });
    }

    // deprecated
    private async walkDirSync(dir: string, thresholdDateInMs: number, callback: Function): Promise<void> {
        fs.readdirSync(dir).forEach(f => {
            if (f.startsWith(".")) { return; }

            let dirPath = Path.join(dir, f);
            let stats: fs.Stats = fs.statSync(dirPath);

            // if last access time after threshold and item is directory
            if ((stats.atimeMs > thresholdDateInMs) && (stats.isDirectory())) {
                this.walkDirSync(dirPath, thresholdDateInMs, callback);

                // if modified time after threshold and item is file
            } else if (stats.mtimeMs > thresholdDateInMs) {

                callback(new Array({
                    path: Path.join(dir, f),
                    name: f,
                    updatedAt: stats.mtimeMs,
                    accessedAt: stats.atimeMs,
                    createdAt: stats.birthtimeMs

                }));
            };
        });
    }
}

export function sortPickEntries(a: FileEntry, b: FileEntry): number {
    return b.updateAt - a.updateAt;

}