import * as vscode from 'vscode';
import * as J from '../..';
import * as fs from 'fs';
import * as Path from 'path';
import { SCOPE_DEFAULT } from '../../ext';




/**
 * Feature responsible for scanning the journal and notes folders and collecting the items displayed in the picklist
*/
export class ScanEntries {

    private cache: J.Model.FileEntry[]; 

    constructor(public ctrl: J.Util.Ctrl) {
        this.cache = []; 
    }

    

    private addScanResult(entry: J.Model.FileEntry) {

    }


    /**
     * 
     * @param thresholdInMs 
     * @param directories 
     * @returns 
     */
    public getPreviouslyAccessedFilesSync(thresholdInMs: number, directories: J.Model.ScopeDirectory[]): Promise<J.Model.FileEntry[]> {

        return new Promise<J.Model.FileEntry[]>((resolve, reject) => {
            try {
                
                this.ctrl.logger.trace("Entering getPreviousJournalFilesSync() in actions/reader.ts");
                
                if(this.cache.length > 0) {
                    resolve(this.cache); 
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
                        this.cache.push(entry);
                    });
                });
                
                // sort by last updated
                this.cache = this.cache.sort((a, b) => a.updateAt - b.updateAt); 
                

                resolve(this.cache);
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
     * Update: ignore threshold
     *
     * @returns {Q.Promise<[string]>}
     * @memberof Reader
     */
    public async getPreviouslyAccessedFiles(thresholdInMs: number, callback: Function, picker: any, type: J.Model.JournalPageType, directories: Set<J.Model.ScopeDirectory>): Promise<void> {

        // go into base directory, find all files changed within the last 40 days
        // for each file, check if it is an entry, a note or an attachement


        this.ctrl.logger.trace("Entering getPreviouslyAccessedFiles() in actions/reader.ts and number of directories to scan: ", directories.size);

        // we have to remove duplicates 


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

        this.walkDir(directory.path, thresholdInMs, (entry: J.Model.FileEntry) => {

            entry.type = J.Util.inferType(Path.parse(entry.path), this.ctrl.config.getFileExtension());
            entry.scope = directory.scope;
            

            // this.cache.push(entry); 

            // this adds the item to the quickpick list of vscode (the addItem Function)
            callback(entry, picker, type);
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

            files.forEach(f => {
                let dirPath = Path.join(dir, f);
                let stats: fs.Stats = fs.statSync(dirPath);

                if (stats.isDirectory()) {
                    this.walkDir(dirPath, thresholdInMs, callback);
                } else {
                    callback({
                        path: Path.join(dir, f),
                        name: f,
                        updatedAt: stats.mtime,
                        accessedAt: stats.atime,
                        createdAt: stats.birthtime
                    });
                }
            });
        });
    }

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

                callback({
                    path: Path.join(dir, f),
                    name: f,
                    updatedAt: stats.mtimeMs,
                    accessedAt: stats.atimeMs,
                    createdAt: stats.birthtimeMs

                });
            };
        });
    }
}