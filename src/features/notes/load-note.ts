import * as vscode from 'vscode';
import { JournalController, Input, NoteInput } from '../../shared/model/index';
import { fileExists } from '../../shared/index';

/**
 * Feature responsible for creating (if needed) and loading notes given a user input as title. 
 * (extracted as feature to enable direct unit tests)
*/
 
export class LoadNotes {

    constructor(public input: NoteInput, public ctrl: JournalController) {

    }

    public async load(): Promise<vscode.TextDocument> {
        let path = await this.ctrl.parser.resolveNotePathForInput(this.input);
        return this.loadWithPath(path); 
    }


    public async loadWithPath(path: string): Promise<vscode.TextDocument> {

        let content: string = await this.ctrl.inject.formatNote(this.input); 

        let document : vscode.TextDocument = await this.loadNote(path, content);

        // inject reference to new note in the target day's journal page (offset from input, defaults to today)
        const entryInput = new Input(this.input.offset);
        entryInput.date = this.input.date;
        entryInput.scope = this.input.scope;
        await this.ctrl.reader.loadEntryForInput(entryInput)
        .catch(reason => this.ctrl.logger.error("Failed to load target day's page for injecting link to note.", reason));

         return document; 
    } 
    
      /**
     * Creates or loads a note
     *
     * @param {string} path
     * @param {string} content
     * @returns {Promise<vscode.TextDocument>}
     * @memberof Writer
     */
    public async loadNote(path: string, content: string): Promise<vscode.TextDocument> {
        this.ctrl.logger.trace("Entering loadNote() in  features/load-note.ts for path: ", path);

        const exists = await fileExists(this.ctrl.fs, path);
        if (exists) {
            return this.ctrl.ui.openDocument(path);
        }
        return this.ctrl.writer.createSaveLoadTextDocument(path, content);
    }
    

}
