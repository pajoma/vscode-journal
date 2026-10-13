import { INotes, JournalController, Input, NoteInput } from '../../shared/model/index';
import { fileExists } from '../../shared/index';

/**
 * Feature responsible for creating (if needed) and loading notes given a user input as title. 
 * (extracted as feature to enable direct unit tests)
*/
 
export class LoadNotes {

    constructor(public input: NoteInput, public ctrl: JournalController) {

    }

    /** The path of the note, created if missing. */
    public async load(): Promise<string> {
        let path = await this.ctrl.parser.resolveNotePathForInput(this.input);
        return this.loadWithPath(path); 
    }


    public async loadWithPath(path: string): Promise<string> {

        let content: string = await this.ctrl.inject.formatNote(this.input); 

        // a new note is linked from the entry of its input's day right away, in every scope (#279)
        const created = !(await fileExists(this.ctrl.fs, path));

        await this.loadNote(path, content);

        // inject reference to new note in the target day's or week's journal page (#149; defaults to today).
        // Scoped notes are linked from the main journal, not from an entry below the scope's base.
        const entryInput = new Input(this.input.offset);
        entryInput.date = this.input.date;
        if (this.input.hasWeek()) { entryInput.setWeek(this.input.week, this.input.weekYear); }
        const entry = await this.ctrl.reader.loadEntryForInput(entryInput)
        .catch(reason => { this.ctrl.logger.error("Failed to load target day's page for injecting link to note.", reason); });
        if (entry && created) {
            this.ctrl.events.fireNoteCreated({ path, entry });
        }

         return path; 
    } 
    
      /**
     * Creates or loads a note
     *
     * @param {string} path
     * @param {string} content
     * @returns the path of the note
     */
    public async loadNote(path: string, content: string): Promise<string> {
        this.ctrl.logger.trace("Entering loadNote() in  features/load-note.ts for path: ", path);

        const exists = await fileExists(this.ctrl.fs, path);
        if (exists) {
            return path;
        }
        return this.ctrl.writer.createFile(path, content);
    }
    

}


/** The notes feature's public service, exposed to other features as `ctrl.notes`. */
export class Notes implements INotes {

    constructor(private readonly ctrl: JournalController) { }

    public open(input: NoteInput): Promise<string> {
        return new LoadNotes(input, this.ctrl).loadWithPath(input.path);
    }
}
