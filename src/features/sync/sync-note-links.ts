import * as vscode from 'vscode';
import * as J from '../..';
import * as Path from 'path';


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
    public async injectAttachmentLinks(doc: vscode.TextDocument, date: Date): Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering injectAttachmentLinks() in features/sync-note-links for date: ", date);

        try {
            await this.ctrl.ui.saveDocument(doc);

            // FIXME: We have to change the logic here: first generate the link according to template, then check if the generated text is already in the document
            const [referencedFiles, foundFiles] = await Promise.all([
                this.getReferencedFiles(doc),
                this.getFilesInNotesFolderAllScopes(doc, date)
            ]);

            const promises: Promise<J.Model.InlineString>[] = foundFiles
                .filter(file => J.Util.isNullOrUndefined(referencedFiles.find(match => match.fsPath === file.fsPath)))
                .map(file => {
                    this.ctrl.logger.debug("injectAttachmentLinks() - File link not present in entry: ", file);
                    return this.buildReference(doc, file);
                });

            const inlineStrings = await Promise.all(promises);
            this.ctrl.logger.trace("injectAttachmentLinks() - Number of references to synchronize: ", inlineStrings.length);

            if (inlineStrings.length > 0) {
                this.ctrl.inject.injectInlineString(inlineStrings[0], ...inlineStrings.splice(1))
                    .catch(() => { /* do nothing */ });
            }

            this.ctrl.ui.saveDocument(doc);
            return doc;
        } catch (err) {
            this.ctrl.logger.error("Failed to synchronize page with notes folder.", err);
            throw err;
        }
    }




    public async getFilesInNotesFolderAllScopes(doc: vscode.TextDocument, date: Date): Promise<vscode.Uri[]> {
        this.ctrl.logger.trace("Entering getFilesInNotesFolderAllScopes() in features/sync-note-links for document: ", doc.fileName);

        const uriArrays = await Promise.all(
            this.ctrl.config.getScopes().map(scope => this.getFilesInNotesFolder(doc, date, scope))
        );

        const locations: vscode.Uri[] = [];
        for (const uriArray of uriArrays) {
            for (const uri of uriArray) {
                // scopes might also point to the default location, which results in duplicate entries
                if (!locations.find(elem => elem.path === uri.path)) {
                    locations.push(uri);
                }
            }
        }
        return locations;
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
        this.ctrl.logger.trace("Entering getFilesInNotesFolder() in actions/reader.ts for document: ", doc.fileName, " and scope ", scope);

        try {
            // FIXME: scan note foldes of new configurations
            const _filePattern = await this.ctrl.config.getNotesFilePattern(date, scope);
            const filePattern = _filePattern.value!.substring(0, _filePattern.value!.lastIndexOf(".")); // exclude file extension, otherwise search does not work
            void filePattern; // used downstream for filtering if needed
            const pathPattern = await this.ctrl.config.getResolvedNotesPath(date, scope);
            pathPattern.value = Path.normalize(pathPattern.value!);
            const dirUri = vscode.Uri.file(pathPattern.value!);

            try {
                await vscode.workspace.fs.stat(dirUri);
            } catch {
                return [];
            }

            const dirEntries = await vscode.workspace.fs.readDirectory(dirUri);
            this.ctrl.logger.debug("Found ", dirEntries.length + "", " objects in notes folder at path: ", JSON.stringify(pathPattern.value!));

            const result: vscode.Uri[] = [];
            for (const [name, type] of dirEntries) {
                if (name.startsWith("~") || name.startsWith(".")) { continue; }
                if (type === vscode.FileType.Directory) { continue; }

                const filePath = Path.normalize(Path.join(pathPattern.value!, name));
                const fileUri = vscode.Uri.file(filePath);

                try {
                    const stat = await vscode.workspace.fs.stat(fileUri);
                    const fileDate = new Date(stat.mtime);
                    if (fileDate.getDate() === date.getDate() &&
                        fileDate.getMonth() === date.getMonth() &&
                        fileDate.getFullYear() === date.getFullYear()) {
                        result.push(fileUri);
                    }
                } catch {
                    // skip files we can't stat
                }
            }
            return result;

        } catch (error) {
            if (error instanceof Error) {
                this.ctrl.logger.error(error.message);
                throw error;
            }
            throw new Error("Failed to scan files in notes folder");
        }
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

        try {
            const references: vscode.Uri[] = [];
            const regexp: RegExp = new RegExp(/\[.*\]\((.*)\)/, 'g');
            let match: RegExpExecArray | null;

            while (match = regexp.exec(doc.getText())) {
                const loc = match![1];
                const dirToEntry: string = Path.parse(doc.uri.fsPath).dir;
                const absolutePath: string = Path.join(dirToEntry, loc);
                references.push(vscode.Uri.file(absolutePath));
            }

            this.ctrl.logger.trace("getReferencedFiles() - Referenced files in document: ", references.length);
            return references;
        } catch (error) {
            this.ctrl.logger.trace("getReferencedFiles() - Failed to find references in journal entry with path ", doc.fileName);
            throw error;
        }
    }



    /**
 * Injects a reference to a file associated with the given document. The reference location can be configured in the template (after-flag)
 * @param doc the document which we will inject into
 * @param file the referenced path
 */
    private async buildReference(doc: vscode.TextDocument, file: vscode.Uri): Promise<J.Model.InlineString> {
        this.ctrl.logger.trace("Entering injectReference() in ext/inject.ts for document: ", doc.fileName, " and file ", file);

        try {
            const tpl = await this.ctrl.config.getFileLinkInlineTemplate();

            // fix for #70
            const pathToLinkedFile: Path.ParsedPath = Path.parse(file.fsPath);
            const pathToEntry: Path.ParsedPath = Path.parse(doc.uri.fsPath);
            const relativePath = Path.relative(pathToEntry.dir, pathToLinkedFile.dir);
            const path = Path.join(relativePath, pathToLinkedFile.name + pathToLinkedFile.ext);
            const link = path.replace(/\\/g, "/");

            let title = pathToLinkedFile.name.replace(/_/g, " ");
            if (pathToLinkedFile.ext.slice(1) !== this.ctrl.config.getFileExtension()) {
                title = "(" + pathToLinkedFile.ext + ") " + title;
            }

            return this.ctrl.inject.buildInlineString(
                doc,
                tpl,
                ["${title}", title],
                // TODO: reference might refer to other locations
                ["${link}", link]
            );
        } catch (error) {
            this.ctrl.logger.error("Failed to inject reference. Reason: ", error);
            throw error;
        }
    }
}
