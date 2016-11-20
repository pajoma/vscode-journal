'use strict';

import * as vscode from 'vscode';
import * as Q from 'q';
// import * as util from './util' ; 
import * as journal from './util';

/**
 * Encapsulates everything needed for the Journal extension. 
 */
export default class Journal {
    private util: journal.Util;
    private config: journal.Configuration;
    private parser: journal.Parser;

    constructor(private vscodeConfig: vscode.WorkspaceConfiguration) {
        this.config = new journal.Configuration(vscodeConfig);
        this.util = new journal.Util(this.config);
        this.parser = new journal.Parser(this.util);
    }


    /**
     * Opens the editor for a specific day. Supported values are explicit dates (in ISO format),
     * offsets (+ or - as prefix and 0) and weekdays (next wednesday) 
     */
    public openDayByInput(): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();
        let options: vscode.InputBoxOptions = {
            prompt: "Enter date (ISO), offset, or weekday: "
        };

        vscode.window.showInputBox(options)
            .then(input => this.parser.tokenize(input), err => deferred.reject(err)) 
            .then(result => this.openDay(result[0]), err => deferred.reject(err))
            .then((doc: vscode.TextDocument) => {
               deferred.resolve(doc);
            });

        /*
        vscode.window.showInputBox(options)
            .then(input => this.parser.resolveOffset(input), err => deferred.reject(err))
            .then(result => this.openDay(result), err => deferred.reject(err))
            .then((doc: vscode.TextDocument) => {
                deferred.resolve(doc);
            });
            */
        return deferred.promise;
    }



    /**
     * Opens an editor for a day with the given offset. 
     * @param {number} offset - 0 is today, -1 is yesterday
     */
    public openDay(offset: number): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();
        if (isNaN(offset)) deferred.reject("Journal: Not a valid value for offset");

        let date = new Date();
        date.setDate(date.getDate() + offset);

        let tpl: string = this.config.getPageTemplate(); 
        let content: string = tpl.replace('{content}', this.util.formatDate(date));

        this.util.getDateFile(date)
            .then((path: string) => this.loadTextDocument(path))
            .catch((path: string) => this.createSaveLoadTextDocument(path, content))
            .then((doc: vscode.TextDocument) => {
                this.showDocument(doc);
                deferred.resolve(doc);
            })
            .catch((err) => {
                let msg = 'Failed to open today\'s note';
                vscode.window.showErrorMessage(msg);
                deferred.reject(msg)
            }
            );
        return deferred.promise;
    }

    /**
     * Creates a new file in a subdirectory with the current day of the month as name. 
     * Shows the file to let the user start adding notes right away. 
     */
    public createNote(): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();
        let options: vscode.InputBoxOptions = {
            prompt: "Enter name for your notes"
        };

        vscode.window.showInputBox(options).then(filename => {
            let content: string = this.config.getPageTemplate().replace('{content}', filename);

            // replace invalid chars
            filename = filename.replace(/\s/g, '_');
            filename = filename.replace(/\\|\/|\<|\>|\:|\n|\||\?|\*/g, '-');
            filename = encodeURIComponent(filename);

            this.util.getFilePathInDateFolder(new Date(), filename)
                .then((path: string) => this.loadTextDocument(path))
                .catch((path: string) => this.createSaveLoadTextDocument(path, content))
                .then((doc: vscode.TextDocument) => {
                    this.showDocument(doc);
                    deferred.resolve(doc);
                })
                .catch((err) => {
                    deferred.reject("Failed to create a new note");
                }
                )
        });
        return deferred.promise;
    }

    /**
     * Adds a new memo to today's page. A memo is a one liner (entered in input box), 
     * which can be used to quickly write down Todos without leaving your current 
     * document.  
     */
    public addMemo(): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();

        let options: vscode.InputBoxOptions = {
            prompt: "Enter text for memo (check extension description for supported flags)"
        };

        let _tokens: [number, string, string]; 
        vscode.window.showInputBox(options)
            .then(input => this.parser.tokenize(input))
            .then(tokens => {
                if(isNaN(tokens[0])) tokens[0] = 0;  
                _tokens = tokens; 
            })
            .then(offset => this.openDay(_tokens[0]))
            .then(doc  => {
                let content: string = this.config.getMemoTemplate().replace('{content}', _tokens[2]);
                this.injectContent(doc, new vscode.Position(2, 0), content);
                deferred.resolve(doc);
            });    

            /*
           
            
            
            .catch(() => {
                deferred.reject("Failed to add memo");
            });
            */


        return deferred.promise;

    }

    /**
     * Called by command 'journal:open'. Opens a new windows with the journal base directory as root. 
     * 
     * 
     */
    public openJournal(): Q.Promise<void> {
        var deferred: Q.Deferred<void> = Q.defer<void>();

        let path = vscode.Uri.file(this.config.getBasePath());
        vscode.commands.executeCommand('vscode.openFolder', path, true)
            .then(success => {
                deferred.resolve(null);
            },
            deferred.reject);

        return deferred.promise;
    }





    /*********  PRIVATE METHODS FROM HERE *********/

    private showDocument(textDocument: vscode.TextDocument): Q.Promise<vscode.TextEditor> {
        var deferred: Q.Deferred<vscode.TextEditor> = Q.defer<vscode.TextEditor>();

        vscode.window.showTextDocument(textDocument, 2, false).then(
            view => {
                console.log("showDocument");
                deferred.resolve(view);
            }, failed => {
                deferred.reject("Failed to show text document");
            });

        return deferred.promise;
    }


    private createSaveLoadTextDocument(path: string, content: string): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();
        let uri: vscode.Uri = vscode.Uri.file(path);
        console.log('Journal: ', 'Creating file: ', uri.fsPath);

        uri = vscode.Uri.parse('untitled:'.concat(uri.fsPath));
        vscode.workspace.openTextDocument(uri)
            .then((doc: vscode.TextDocument) => this.fillTextDocument(doc, content))
            .then((doc: vscode.TextDocument) => {
                deferred.resolve(doc);
            },
            failed => {
                console.log("Failed to create file: ", uri.toString());
                deferred.reject("Failed to create file.");
            }
            );

        return deferred.promise;
    }


    private loadTextDocument(path: string): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();
        let uri = vscode.Uri.file(path);

        vscode.workspace.openTextDocument(uri).then(
            deferred.resolve,
            failed => deferred.reject(path) // return path to reuse it later in createDoc
        );

        return deferred.promise;
    }


    private fillTextDocument(doc: vscode.TextDocument, content: string): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();

        // if TextDocument is already loaded, we get the view and insert there, otherwise in the background
        let pos = new vscode.Position(0, 0);
        let edit = new vscode.WorkspaceEdit();
        edit.insert((doc.uri), pos, content);

        vscode.workspace.applyEdit(edit).then(success => {
            console.log("Content added to today's note")
            deferred.resolve(doc);
        }, failed => {
            deferred.reject("Failed to insert content into file");
        });

        return deferred.promise;
    }

    /**
     * Injects the content at the given position. 
     * 
     */
    private injectContent(doc: vscode.TextDocument, pos: vscode.Position, content: string): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();


        let c = pos.line - doc.lineCount;
        // add new lines before injecting (otherwise line count will be ignored) 
        if (c > 0) {
            while (c != 0) {
                content = '\n' + content;
                c++;
            }
            // shift existing content, otherwise it will be replaced    
        }// else if(c>=0) {
        content += '\n';
        //}

        let edit = new vscode.WorkspaceEdit();
        edit.insert(doc.uri, pos, content);

        vscode.workspace.applyEdit(edit).then(success => {
            doc.save().then(() => {
                deferred.resolve(doc);
            }, failed => {
                deferred.reject("Failed to save file");
            })
        }, failed => {
            deferred.reject("Failed to insert memo into file");
        });

        return deferred.promise;
    }
}