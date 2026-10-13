import * as vscode from 'vscode';
import { JournalController, InlineString } from '../../shared/model/index';
import { isNullOrUndefined } from '../../shared/index';
import * as Path from 'path';


/**
 * Feature responsible for finding existing references to notes in current view as well as scanning the configured folders for unreferenced files.
 * Syncs the two lists with the goal, to have easy access to all notes from the journal entries.
 */
export class SyncNoteLinks {

    /** Link updates run one after another: two of them on the same entry would insert at stale positions. */
    private queue: Promise<unknown> = Promise.resolve();

    private serial<T>(task: () => Promise<T>): Promise<T> {
        const run = this.queue.then(task, task);
        this.queue = run.catch(() => undefined);
        return run;
    }

    constructor(public ctrl: JournalController) {
    }

    /**
    * Checks for the given text document if it contains references to notes (and if there are notes in the associated folders)
    * It compares the two lists and creates (or deletes) any missing links
    *
    * @param path the journal entry
    */
    public injectAttachmentLinks(path: string, date: Date): Promise<void> {
        return this.serial(() => this.injectAttachmentLinksNow(path, date));
    }

    private async injectAttachmentLinksNow(path: string, date: Date): Promise<void> {
        this.ctrl.logger.trace("Entering injectAttachmentLinks() in features/sync-note-links for date: ", date);

        try {
            await this.ctrl.editor.save(path);

            // existing links are found by their target, so a changed link template does not link a note twice
            const [referencedFiles, foundFiles] = await Promise.all([
                this.getReferencedFiles(path),
                this.getFilesInNotesFolderAllScopes(path, date)
            ]);

            const promises: Promise<InlineString>[] = foundFiles
                .filter(file => isNullOrUndefined(referencedFiles.find(match => match.fsPath === file.fsPath)))
                .map(file => {
                    this.ctrl.logger.debug("injectAttachmentLinks() - File link not present in entry: ", file);
                    return this.buildReference(path, file);
                });

            const inlineStrings = await Promise.all(promises);
            this.ctrl.logger.trace("injectAttachmentLinks() - Number of references to synchronize: ", inlineStrings.length);

            if (inlineStrings.length > 0) {
                await this.ctrl.inject.injectInlineString(inlineStrings[0], ...inlineStrings.splice(1))
                    .catch(() => { /* do nothing */ });
            }

            await this.ctrl.editor.save(path);
        } catch (err) {
            this.ctrl.logger.error("Failed to synchronize page with notes folder.", err);
            throw err;
        }
    }




    /**
     * Links the given notes from the entry, unless it already links to them
     * (used for new notes, see NoteCreatedEvent).
     */
    public linkNotes(entry: string, paths: string[]): Promise<void> {
        return this.serial(() => this.linkNotesNow(entry, paths));
    }

    private async linkNotesNow(entry: string, paths: string[]): Promise<void> {
        const referenced = await this.getReferencedFiles(entry);
        const missing = paths
            .map(path => vscode.Uri.file(path))
            .filter(file => !referenced.some(ref => ref.fsPath === file.fsPath));
        if (missing.length === 0) { return; }
        const inlineStrings = await Promise.all(missing.map(file => this.buildReference(entry, file)));
        await this.ctrl.inject.injectInlineString(inlineStrings[0], ...inlineStrings.slice(1));
        await this.ctrl.editor.save(entry);
    }

    /** The notes of the day in every scope whose notes pattern names a day, without duplicates. */
    public async getFilesInNotesFolderAllScopes(entry: string, date: Date): Promise<vscode.Uri[]> {
        this.ctrl.logger.trace("Entering getFilesInNotesFolderAllScopes() in features/sync-note-links for entry: ", entry);

        const uriArrays = await Promise.all(
            this.ctrl.config.getScopeList().map(scope => this.getFilesInNotesFolder(date, scope.name))
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
    * The notes of a day in a scope: the files in the scope's notes folder for that day whose names match
    * its file pattern for that day (#279). Not their modification date: editing an old note must not
    * link it from today's entry. A scope whose notes pattern names no single day (folder scopes, flat
    * or monthly folders) has none; its notes are linked when they are created (see linkNotes).
    *
    * @param date the day of the journal entry
    * @param scope the scope whose notes folder is scanned
    */
    public async getFilesInNotesFolder(date: Date, scope: string): Promise<vscode.Uri[]> {
        const notes = this.ctrl.config.getNotesOfDay(date, scope);
        if (!notes) { return []; }
        const folder = Path.normalize(notes.folder);

        // a missing notes folder (or one removed while scanning) has no notes to link
        let dirEntries: [string, vscode.FileType][];
        try {
            dirEntries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(folder));
        } catch (error) {
            if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') { return []; }
            throw error;
        }
        this.ctrl.logger.debug("Found ", dirEntries.length + "", " objects in notes folder at path: ", JSON.stringify(folder));

        return dirEntries
            .filter(([name, type]) => type !== vscode.FileType.Directory
                && !name.startsWith("~") && !name.startsWith(".") && notes.file.test(name))
            .map(([name]) => vscode.Uri.file(Path.join(folder, name)));
    }


    /**
   *  Returns a list of all local files referenced in the given entry (its editor text, unsaved changes included).
   *
   * @param entry path of the current journal entry
   * @returns {Q.Promise<string[]>} an array with all references in  the current journal page
   * @memberof Reader
   */
    public async getReferencedFiles(entry: string): Promise<vscode.Uri[]> {
        this.ctrl.logger.trace("Entering getReferencedFiles() in features/sync-note-links for entry: ", entry);

        try {
            const references: vscode.Uri[] = [];
            const regexp: RegExp = new RegExp(/\[.*\]\((.*)\)/, 'g');
            const text = await this.ctrl.editor.getText(entry);
            const dirToEntry: string = Path.parse(entry).dir;
            let match: RegExpExecArray | null;

            while (match = regexp.exec(text)) {
                const loc = match![1];
                const absolutePath: string = Path.join(dirToEntry, loc);
                references.push(vscode.Uri.file(absolutePath));
            }

            this.ctrl.logger.trace("getReferencedFiles() - Referenced files in document: ", references.length);
            return references;
        } catch (error) {
            this.ctrl.logger.trace("getReferencedFiles() - Failed to find references in journal entry with path ", entry);
            throw error;
        }
    }



    /**
 * Injects a reference to a file associated with the given document. The reference location can be configured in the template (after-flag)
 * @param entry path of the entry which we will inject into
 * @param file the referenced path
 */
    private async buildReference(entry: string, file: vscode.Uri): Promise<InlineString> {
        this.ctrl.logger.trace("Entering buildReference() in features/sync-note-links for entry: ", entry, " and file ", file);

        try {
            const tpl = this.ctrl.config.getFileLinkInlineTemplate();

            // fix for #70
            const pathToLinkedFile: Path.ParsedPath = Path.parse(file.fsPath);
            const pathToEntry: Path.ParsedPath = Path.parse(entry);
            const relativePath = Path.relative(pathToEntry.dir, pathToLinkedFile.dir);
            const path = Path.join(relativePath, pathToLinkedFile.name + pathToLinkedFile.ext);
            const link = path.replace(/\\/g, "/");

            let title = pathToLinkedFile.name.replace(/_/g, " ");
            if (pathToLinkedFile.ext.slice(1) !== this.ctrl.config.getFileExtension()) {
                title = "(" + pathToLinkedFile.ext + ") " + title;
            }

            return this.ctrl.inject.buildInlineString(
                entry,
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
