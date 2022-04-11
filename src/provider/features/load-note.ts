import * as vscode from 'vscode';
import * as J from '../..';

/**
 * Feature responsible for creating (if needed) and loading notes given a user input as title. 
 * (extracted as feature to enable direct unit tests)
*/
 
export class LoadNotes {

    constructor(public input: J.Model.Input, public ctrl: J.Util.Ctrl) {

    }

    public async load(): Promise<vscode.TextDocument> {
        let path = await this.ctrl.parser.resolveNotePathForInput(this.input);
        return this.loadWithPath(path); 
    }


    public async loadWithPath(path: string): Promise<vscode.TextDocument> {

        let content: string = await this.ctrl.inject.formatNote(this.input); 

        let document : vscode.TextDocument = await this.loadNote(path, content);

        // inject reference to new note in today's journal page
        await this.ctrl.reader.loadEntryForInput(new J.Model.Input(0))  // triggered automatically by loading today's page (we don't show it though)
        .catch(reason => this.ctrl.logger.error("Failed to load today's page for injecting link to note.", reason)); 

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

        return new Promise<vscode.TextDocument>((resolve, reject) => {
            // check if file exists already

            this.ctrl.ui.openDocument(path)
                .then((doc: vscode.TextDocument) => resolve(doc))
                .catch(error => {
                    this.ctrl.writer.createSaveLoadTextDocument(path, content)
                        .then((doc: vscode.TextDocument) => resolve(doc))
                        .catch(error => {
                            this.ctrl.logger.error(error);
                            reject("Failed to load note.");
                        });
                });

        });
    }
    

}
