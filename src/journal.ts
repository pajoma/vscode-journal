// Copyright (C) 2016  Patrick Maué
// 
// This file is part of vscode-journal.
// 
// vscode-journal is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// 
// vscode-journal is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
// 
// You should have received a copy of the GNU General Public License
// along with vscode-journal.  If not, see <http://www.gnu.org/licenses/>.
// 


'use strict';

import * as vscode from 'vscode';
import * as Q from 'q';
import * as journal from './util';

/**
 * Encapsulates everything needed for the Journal extension. 
 */
export default class Journal {
    private util: journal.Util;
    private config: journal.Configuration;
    private parser: journal.Parser;
    private writer: journal.Writer; 
    private vsExt: journal.VSCode; 
    private reader: journal.Reader; 

    constructor(private vscodeConfig: vscode.WorkspaceConfiguration) {
        this.config = new journal.Configuration(vscodeConfig);
        this.util = new journal.Util(this.config);
        this.parser = new journal.Parser(this.util);
        this.writer = new journal.Writer(this.config);
        this.reader = new journal.Reader(this.config, this.util); 
        this.vsExt = new journal.VSCode(this.writer); 
         
    }


    
    public openDayByInputOrSelection(): Q.Promise<vscode.TextDocument> {
        let deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();

        
        this.gatherSelection()
            .then(items => {
                console.log(JSON.stringify(items)); 
                
                return this.vsExt.getUserInputComboSync("Enter day or memo (with flags)", items)
            }
            )        
            .then( (value: string) => this.parser.tokenize(value) )
            .then( (input: journal.Input) => this.open(input) )
            .then( (doc: vscode.TextDocument) => deferred.resolve(doc) )
            .catch((err) => {
                if(err != 'cancel') {
                    let msg = 'Failed to translate input into action';
                    vscode.window.showErrorMessage(msg);
                    deferred.reject(msg)
                }

              
            });

        return deferred.promise;
    }

    private gatherSelection(): Q.Promise<[journal.PickDayItem]> {
        let deferred: Q.Deferred<[journal.PickDayItem]> = Q.defer<[journal.PickDayItem]>();

        let res:[journal.PickDayItem] = <[journal.PickDayItem]> new Array(); 
        this.reader.getPreviousJournalFiles()
            .then(files => {
                files.forEach(file => {
                    res.push(new journal.PickDayItem(file, "This is a generic desc")); 
                }); 
                deferred.resolve(res); 
                
            }); 

        this.reader.getPreviousJournalFiles(); 

        return deferred.promise; 
    }

    /**
     * Opens the editor for a specific day. Supported values are explicit dates (in ISO format),
     * offsets (+ or - as prefix and 0) and weekdays (next wednesday) 
     */
    public openDayByInput(): Q.Promise<vscode.TextDocument> {
        let deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();


        this.reader.getPreviousJournalFiles(); 
        
        this.vsExt.getUserInput("Enter day or memo (with flags) ")
            .then( (value: string) => this.parser.tokenize(value) )
            .then( (input: journal.Input) => this.open(input) )
            .then( (doc: vscode.TextDocument) => deferred.resolve(doc) )
            .catch((err) => {
                if(err != 'cancel') {
                    let msg = 'Failed to translate input into action';
                    vscode.window.showErrorMessage(msg);
                    deferred.reject(msg)
                }

              
            });

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

        this.util.getFileForDate(date)
            .then((path: string) => this.vsExt.loadTextDocument(path))
            .catch((path: string) => this.vsExt.createSaveLoadTextDocument(path, content))
            .then((doc: vscode.TextDocument) => {
                this.vsExt.showDocument(doc);
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

        let content: string = this.config.getPageTemplate(); 
        this.vsExt.getUserInput("Enter name for your notes")
            .then( (input:string) => this.util.normalizeFilename(input) )
            .then( (filename:string) => this.util.getFilePathInDateFolder(new Date(), filename) )
            .catch( (filename: string) => {
                let content: string = this.config.getPageTemplate().replace('{content}', filename)
                return this.vsExt.createSaveLoadTextDocument(filename, content); 
            }) 
            .then( (doc: vscode.TextDocument) => {
                    this.vsExt.showDocument(doc);
                    deferred.resolve(doc);
                })
            .catch((err) => {
                if(err != 'cancel') {
                    deferred.reject("Failed to create a new note. Reason is ["+err+"]"); 
                }
            }); 

        return deferred.promise;
    }

    /**
     * Adds a new memo to today's page. A memo is a one liner (entered in input box), 
     * which can be used to quickly write down ToDos without leaving your current 
     * document.  
     */
    public addMemo(input: journal.Input): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();
        this.openDay(input.offset)
            .then( doc => this.writer.writeInputToFile(doc, new vscode.Position(2, 0), input))
            .then( doc => deferred.resolve(doc) )
            .catch( () => deferred.reject("Failed to add memo")); 
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

    /** 
     * Opens a specific page depending on the input 
     */
    private open(input: journal.Input): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();

        if(input.hasMemo() && input.hasFlags()) {
            return this.addMemo(input); 
        } 

        if(input.hasOffset()) {
            return this.openDay(input.offset); 
        }
        return deferred.promise; 
    };










   




}