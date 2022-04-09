import { deprecate } from 'util';
import * as vscode from 'vscode';
import * as J from '../..';

/**
 * Feature responsible for creating (if needed) and loading notes given a user input as title. 
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
        let document : vscode.TextDocument = await this.ctrl.reader.loadNote(path, content);

         // inject reference to new note in today's journal page
         await this.ctrl.reader.loadEntryForInput(new J.Model.Input(0))  // triggered automatically by loading today's page (we don't show it though)
         .catch(reason => this.ctrl.logger.error("Failed to load today's page for injecting link to note.", reason)); 

         return document; 
    } 
    
    public async loadX(): Promise<vscode.TextEditor | void> {
        return new Promise((resolve, reject) => {
            Promise.all([
                this.ctrl.parser.resolveNotePathForInput(this.input),
                this.ctrl.inject.formatNote(this.input)
            ]).then(([path, content]) =>
                this.ctrl.reader.loadNote(path, content))
                .then((doc: vscode.TextDocument) =>
                    this.ctrl.ui.showDocument(doc))
                .then(resolve)
                .catch(reason => {
                    if (reason !== 'cancel') {
                        this.ctrl.logger.error("Failed to load note", reason);
                        reject(reason);
                    } else { resolve(); }
                });
            // inject reference to new note in today's journal page
            this.ctrl.reader.loadEntryForInput(new J.Model.Input(0))  // triggered automatically by loading today's page (we don't show it though)
                .catch(reason => {
                    this.ctrl.logger.error("Failed to load today's page for injecting link to note.", reason);
                });

        });



    }
}
