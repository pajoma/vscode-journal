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
import * as journal from '.'
import * as fs from 'fs'
import * as Q from 'q';

/** 
 * Anything which scans the files in the background goes here
 * 
 */
export class Reader {
    constructor(public config: journal.Configuration, public util: journal.Util) {
    }


    public getPreviousJournalFiles(): Q.Promise<[string]> {

        var deferred: Q.Deferred<[string]> = Q.defer<[string]>();

        let monthDir = this.util.getPathOfMonth(new Date());
        let rexp = new RegExp("^\\d{2}\." + this.config.getFileExtension());
        console.log("reading files in " + monthDir);

        let fileItems: [string] = <[string]>new Array();
        fs.readdir(monthDir, function (err, files: string[]) {
            if (err) deferred.reject(err);
            else {
                for (var i = 0; i < files.length; i++) {
                    let match = files[i].match(rexp);
                    if (match && match.length > 0) {
                        fileItems.push(files[i]);
                        /*
                        let p = monthDir + files[i];                 
                         fs.stat(p, (err, stats) => {
                            if (stats.isFile()) {
                                fileItems.push(files[i]); 
                            }
                        }); */
                    }
                }
                console.log("Result:::", JSON.stringify(fileItems))
                deferred.resolve(fileItems);
            }
        });


        return deferred.promise;
    }


    /**
     * Returns a list of all local files referenced in the given document. 
     * @param doc 
     */
    public getReferencedFiles(doc: vscode.TextDocument): Q.Promise<string[]> {
        let deferred: Q.Deferred<string[]> = Q.defer<string[]>();
        let references: string[] = [];

        // type lineTuple = [string,string]; 

        Q.fcall(() => {
            let day: string = this.util.getFileInURI(doc.uri.toString()); 
            let regexp: RegExp = new RegExp("\\[.*\\]\\(\\.\\/"+day+"\\/(.*[^\\)])\\)", 'g'); 
            let match:RegExpExecArray = null; 
            while( (match = regexp.exec(doc.getText())) != null) {
                references.push(match[1]);
            }
            deferred.resolve(references);
        });

        return deferred.promise;
    }

    /**
     * Returns a list of files sitting in the notes folder for the current document (has to be a journal page)
     * @param doc 
     */
    public getFilesInNotesFolder(doc: vscode.TextDocument): Q.Promise<string[]> {
        let deferred: Q.Deferred<string[]> = Q.defer<string[]>();
        let references: string[] = [];

        // TODO: check wether this is a valid journal page

        Q.fcall(() => {

            // get base directory of file
            let p: string = doc.uri.fsPath; 

            // get filename, strip extension, set as notes getFilesInNotesFolder
            p = p.substring(0, p.lastIndexOf("."));
            
            // list all files in directory and put into array
            fs.readdir(p,  (err, files) => {
                if(err) {
                    deferred.resolve; 
                } else {
                    deferred.resolve(files); 
                }
                return; 
            }); 

            // sa
            console.log(p)
        });


        return deferred.promise;
    }
}

