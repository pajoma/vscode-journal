import * as vscode from 'vscode';
import * as J from '../..';
import * as Path from 'path';
import * as fs from 'fs';


/**
 * Feature responsible for finding existing references to notes in current view as well as scanning the configured folders for unreferenced files. 
 * Syncs the two lists with the goal, to have easy access to all notes from the journal entries. 
 */
export class SyncNoteLinks {

    constructor(public ctrl: J.Util.Ctrl) {
    }

     /**
     * Checks for the given text document if it contains references to notes (and if there are notes in the associated folders)
     * It compares the two lists and creates (or deletes) any missing links
     * 
     * @param doc 
     */
      public async injectAttachementLinks(doc: vscode.TextDocument, date: Date): Promise<vscode.TextDocument> {
        return new Promise((resolve, reject) => {
            this.ctrl.logger.trace("Entering injectAttachementLinks() in features/sync-note-links for date: ", date);


            this.ctrl.ui.saveDocument(doc)
                .then(() =>

                    // FIXME: We have to change the logic here: first generate the link according to template, then check if the generated text is already in the document

                    // we invoke the scan of the notes directory in parallel
                    Promise.all([
                        this.getReferencedFiles(doc),
                        this.getFilesInNotesFolderAllScopes(doc, date)
                    ])
                )
                .then(found => {
                    let referencedFiles = found[0];
                    let foundFiles = found[1];

                    // for each file, check whether it is in the list of referenced files
                    let promises: Promise<J.Model.InlineString>[] = [];

                    foundFiles.forEach((file, index, array) => {
                        let foundFile: vscode.Uri | undefined = referencedFiles.find(match => match.fsPath === file.fsPath);
                        if (J.Util.isNullOrUndefined(foundFile)) {
                            this.ctrl.logger.debug("injectAttachementLinks() - File link not present in entry: ", file);
                            // files.push(file); 
                            // we don't execute yet, just collect the promises
                            promises.push(this.buildReference(doc, file));

                        }
                    });
                    return Promise.all(promises);
                })
                .then((inlineStrings: J.Model.InlineString[]) => {
                    this.ctrl.logger.trace("injectAttachementLinks() - Number of references to synchronize: ", inlineStrings.length);

                    if (inlineStrings.length > 0) {
                        this.ctrl.inject.injectInlineString(inlineStrings[0], ...inlineStrings.splice(1))
                            .catch(reason => {
                                // do nothing
                            }); 
                    }

                   return doc; 

                })
                .then(doc => {
                    this.ctrl.ui.saveDocument(doc); 
                    resolve(doc); 
                })
                .catch((err: Error) => {
                    this.ctrl.logger.error("Failed to synchronize page with notes folder.", err);
                    reject(err);
                });
        });
    }




    public async getFilesInNotesFolderAllScopes(doc: vscode.TextDocument, date: Date): Promise<vscode.Uri[]> {
        return new Promise<vscode.Uri[]>((resolve, reject) => {
            this.ctrl.logger.trace("Entering getFilesInNotesFolderAllScopes() in features/sync-note-links for document: ", doc.fileName);

            // scan attachement folders for each scope
            let promises: Promise<vscode.Uri[]>[] = [];
            this.ctrl.config.getScopes().forEach(scope => {
                let promise: Promise<vscode.Uri[]> = this.getFilesInNotesFolder(doc, date, scope);
                promises.push(promise);
            });

            // map to consolidated list of uris

            Promise.all(promises)
                .then((uriArrays: vscode.Uri[][]) => {
                    let locations: vscode.Uri[] = [];
                    uriArrays.forEach(uriArray => {
                        uriArray.forEach(uri => {
                            // scopes might also point to the default location, which results in duplicate entries    
                            if (!locations.find(elem => elem.path === uri.path)) {
                                locations.push(uri);
                            }
                        }); 
                    });
                    return locations;
                })
                .then(resolve)
                .catch(reject);
        });

    }


     /**
     * Returns a list of files sitting in the notes folder for the current document (has to be a journal page)
     * 
     * By making the notes folder configurable, we cannot differentiate anymore by path. We always find 
     * (and inject all notes). We therefore also check the last modification date of the file itself
     *
     * @param {vscode.TextDocument} doc the current journal entry 
     * @returns {Q.Promise<ParsedPath[]>} an array with all files sitting in the directory associated with the current journal page
     * @memberof Reader
     */
      public async getFilesInNotesFolder(doc: vscode.TextDocument, date: Date, scope: string): Promise<vscode.Uri[]> {

        return new Promise<vscode.Uri[]>((resolve, reject) => {
            this.ctrl.logger.trace("Entering getFilesInNotesFolder() in actions/reader.ts for document: ", doc.fileName, " and scope ", scope);
            
            try {
                let filePattern: string;

                // FIXME: scan note foldes of new configurations
                this.ctrl.config.getNotesFilePattern(date, scope)
                    .then((_filePattern: J.Model.ScopedTemplate) => {
                        filePattern = _filePattern.value!.substring(0, _filePattern.value!.lastIndexOf(".")); // exclude file extension, otherwise search does not work
                        return this.ctrl.config.getResolvedNotesPath(date, scope);
                    })
                    .then((pathPattern: J.Model.ScopedTemplate) => {
                        pathPattern.value = Path.normalize(pathPattern.value!);

                        // check if directory exists
                        fs.access(pathPattern.value!, (err: NodeJS.ErrnoException | null) => {
                            if (J.Util.isNullOrUndefined(err)) {
                                // list all files in directory and put into array
                                fs.readdir(pathPattern.value!, (err: NodeJS.ErrnoException | null, files: string[]) => {
                                    try {
                                        if (J.Util.isNotNullOrUndefined(err)) { reject(err!.message); }
                                        
                                        this.ctrl.logger.debug("Found ", files.length+"", " objects in notes folder at path: ", JSON.stringify(pathPattern.value!));

                                        

                                        let result = files.filter((name: string) => {
                                            // filter, check if no temporary files are included (since Office tends to do it this alot)
                                            return (!name.startsWith("~") || !name.startsWith("."));
                                           
                                        })    
                                        .map((name: string) => Path.normalize(pathPattern.value! + Path.sep + name))

                                        // read out the file stats (sync, since I don't really understand how to flatten the promise within this context)
                                        .map((file: fs.PathLike) => { return { file: file, stats: fs.statSync(file)}; })
                                        
                                        // fix for #100, exclude subdirectories
                                        .filter(fileWithStats => ! fileWithStats.stats.isDirectory())
                                         // filter: check if the current file was last modified at the current day
                                        .filter(fileWithStats => {
                                            let fileDate: Date =  fileWithStats.stats.mtime;

                                            let res =  (fileDate.getDate() === date.getDate()) &&
                                            (fileDate.getMonth() === date.getMonth()) &&
                                            (fileDate.getFullYear() === date.getFullYear()); 
                                            return res; 

                                        })
                                        .map(fileWithStats => vscode.Uri.file(fileWithStats.file.toString()));
                                        

                                        



                                        resolve(result);
                                    } catch (error) {
                                        reject(error);
                                    }

                                });
                            } else {
                                resolve([]);
                            }

                        });


                    });

                /*
            // get base directory of file
            let p: string = doc.uri.fsPath;
    
            // get filename, strip extension, set as notes getFilesInNotesFolder
            p = p.substring(0, p.lastIndexOf("."));
    
    */


            } catch (error) {
                if(error instanceof Error) {
                    this.ctrl.logger.error(error.message);
                    reject(error); 
                } else {
                    reject("Failed to scan files in notes folder");
                }
            }
        });
    }


      /**
     *  Returns a list of all local files referenced in the given document. 
     *
     * @param {vscode.TextDocument} doc the current journal entry 
     * @returns {Q.Promise<string[]>} an array with all references in  the current journal page
     * @memberof Reader
     */
       public async getReferencedFiles(doc: vscode.TextDocument): Promise<vscode.Uri[]> {
        this.ctrl.logger.trace("Entering getReferencedFiles() in actions/reader.ts for document: ", doc.fileName);

        return new Promise<vscode.Uri[]>((resolve, reject) => {
            try {
                let references: vscode.Uri[] = [];
                let regexp: RegExp = new RegExp(/\[.*\]\((.*)\)/, 'g');
                let match: RegExpExecArray | null;

                while (match = regexp.exec(doc.getText())) {
                    let loc = match![1];

                    // parse to path to resolve relative paths (starting with ./)
                    let dirToEntry: string = Path.parse(doc.uri.fsPath).dir; // resolve assumes directories, not files
                    let absolutePath : string = Path.join(dirToEntry, loc); 

                    references.push(vscode.Uri.file(absolutePath));
                }

                this.ctrl.logger.trace("getReferencedFiles() - Referenced files in document: ", references.length);
                resolve(references);
            } catch (error) {
                this.ctrl.logger.trace("getReferencedFiles() - Failed to find references in journal entry with path ", doc.fileName);
                reject(error);
            }
        });

    }



        /**
     * Injects a reference to a file associated with the given document. The reference location can be configured in the template (after-flag)
     * @param doc the document which we will inject into
     * @param file the referenced path 
     */
         private async buildReference(doc: vscode.TextDocument, file: vscode.Uri): Promise<J.Model.InlineString> {
            return new Promise<J.Model.InlineString>((resolve, reject) => {
                try {
                    this.ctrl.logger.trace("Entering injectReference() in ext/inject.ts for document: ", doc.fileName, " and file ", file);
    
                    this.ctrl.config.getFileLinkInlineTemplate()
                        .then(tpl => {
                            // fix for #70 
                            const pathToLinkedFile: Path.ParsedPath = Path.parse(file.fsPath);
                            const pathToEntry: Path.ParsedPath = Path.parse(doc.uri.fsPath);
                            const relativePath = Path.relative(pathToEntry.dir, pathToLinkedFile.dir);
                            const path = Path.join(relativePath, pathToLinkedFile.name + pathToLinkedFile.ext);
                            const link = path.replace(/\\/g, "/");
    
                            let title = pathToLinkedFile.name.replace(/_/g, " ");
                            if (pathToLinkedFile.ext.slice(1) !== this.ctrl.config.getFileExtension()) {
                                title = "(" + pathToLinkedFile.ext + ") " + title;
                            };
    
    
                            return this.ctrl.inject.buildInlineString(
                                doc,
                                tpl,
                                ["${title}", title],
                                // TODO: reference might refer to other locations 
                                ["${link}", link]
                            );
                        }
                        )
                        .then(inlineString => resolve(inlineString))
                        .catch(error => {
                            this.ctrl.logger.error("Failed to inject reference. Reason: ", error);
                            reject(error);
                        });
    
    
                } catch (error) {
                    reject(error);
                }
            });
        }
}