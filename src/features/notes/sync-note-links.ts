import * as vscode from 'vscode';
import { JournalController } from '../../shared/model/index';
import { isNullOrUndefined } from '../../shared/index';
import { fileLink, LINE_KINDS, linkTargets, noteTitle, NotesOfDay, parseWikiTarget, wikiLinks, wikiTargetMatchesNote } from 'journal-core';
import * as Path from 'path';
import { notesOfDayFiles } from '../../shared/journal/notes-of-day';


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
            const [referencedFiles, foundFiles, linkedByWiki] = await Promise.all([
                this.getReferencedFiles(path),
                this.getFilesInNotesFolderAllScopes(path, date),
                this.wikiLinked(path),
            ]);

            const missing = foundFiles
                .filter(file => isNullOrUndefined(referencedFiles.find(match => match.fsPath === file.fsPath)) && !linkedByWiki(file.fsPath));
            missing.forEach(file => this.ctrl.logger.debug("injectAttachmentLinks() - File link not present in entry: ", file));
            this.ctrl.logger.trace("injectAttachmentLinks() - Number of references to synchronize: ", missing.length);

            if (missing.length > 0) {
                await this.injectReferences(path, missing)
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
        const linkedByWiki = await this.wikiLinked(entry);
        const missing = paths
            .map(path => vscode.Uri.file(path))
            .filter(file => !referenced.some(ref => ref.fsPath === file.fsPath) && !linkedByWiki(file.fsPath));
        if (missing.length === 0) { return; }
        await this.injectReferences(entry, missing);
        await this.ctrl.editor.save(entry);
    }

    /**
     * Whether the entry links a note with a wiki link (#92), e.g. `[[Konzept]]`:
     * a target with the note's title (by any layout's notes file pattern) and
     * the folders in front of it, if any. The scope of a `[[#scope Title]]` is
     * not checked.
     */
    private async wikiLinked(entry: string): Promise<(file: string) => boolean> {
        const targets = wikiLinks(await this.ctrl.editor.getText(entry)).map(link => parseWikiTarget(link.target));
        if (targets.length === 0) { return () => false; }
        const patterns = new Set(this.ctrl.config.getScopeList()
            .flatMap(scope => this.ctrl.config.getLayouts(scope.isDefault ? undefined : scope.name).map(layout => layout.patterns.notes.file)));
        return file => [...patterns].some(pattern => {
            const note = { path: file, title: noteTitle(file, pattern), scope: '' };
            return targets.some(target => target.kind === 'note' && wikiTargetMatchesNote({ ...target, scope: undefined }, note));
        });
    }

    /** The notes of the day in every scope, without duplicates. */
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
    * The notes of a day in a scope (#279): the files in the scope's notes folder for that day that match its
    * file pattern for that day. If the pattern names no single day (folder scopes, flat or monthly folders),
    * only the files created on that day, so notes added outside the extension are linked too. Never by their
    * modification date: editing an old note must not link it from today's entry. The notes folders of the
    * earlier layouts (journal.patternHistory, #309) are scanned too.
    *
    * @param date the day of the journal entry
    * @param scope the scope whose notes folder is scanned
    */
    public async getFilesInNotesFolder(date: Date, scope: string): Promise<vscode.Uri[]> {
        const layouts = this.ctrl.config.getNotesOfDayInLayouts(date, scope);
        return (await Promise.all(layouts.map(notes => this.getNotesOfDay(notes)))).flat();
    }

    /** The files of one notes folder that are notes of the day (through ctrl.fs, see notesOfDayFiles). */
    private async getNotesOfDay(notes: NotesOfDay): Promise<vscode.Uri[]> {
        const files = await notesOfDayFiles(this.ctrl.fs, notes);
        this.ctrl.logger.debug("Notes of the day in ", JSON.stringify(notes.folder), ": ", files.length + "");
        return files.map(file => vscode.Uri.file(file));
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
            // the link targets as journal-core reads them, like the MCP server (#250)
            const dirToEntry: string = Path.parse(entry).dir;
            const references = linkTargets(await this.ctrl.editor.getText(entry))
                .map(target => vscode.Uri.file(Path.join(dirToEntry, target)));

            this.ctrl.logger.trace("getReferencedFiles() - Referenced files in document: ", references.length);
            return references;
        } catch (error) {
            this.ctrl.logger.trace("getReferencedFiles() - Failed to find references in journal entry with path ", entry);
            throw error;
        }
    }



    /**
     * Links the files from the entry with the `files` template, at its anchor
     * after the existing links (#320), relative to the entry (#70), as
     * journal-core writes file links (#250).
     */
    private async injectReferences(entry: string, files: vscode.Uri[]): Promise<void> {
        this.ctrl.logger.trace("Entering injectReferences() in features/sync-note-links for entry: ", entry, " and files ", files);
        const lines = files.map(file => {
            const { title, link } = fileLink(Path.parse(entry).dir, file.fsPath, this.ctrl.config.getFileExtension());
            return { values: [["${title}", title], ["${link}", link]] };
        });
        await this.ctrl.inject.place(entry, this.ctrl.config.getFileLinkInlineTemplate(), LINE_KINDS.link, lines);
    }
}
