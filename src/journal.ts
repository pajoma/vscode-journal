'use strict';

import * as vscode from 'vscode';
import * as Q from 'q';  


/**
 * Encapsulates everything needed for the Journal extension. 
 */
export default class Journal {

    constructor(public config: vscode.WorkspaceConfiguration) {

    }


    public openDayByInput() : Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();

        let options:vscode.InputBoxOptions = {
            prompt: "Enter date (ISO), offset, or weekday: "
        }; 

        vscode.window.showInputBox(options)
            .then(input => this.resolveOffset(input), err => deferred.reject(err))
            .then(offset => this.openDay(offset), err => deferred.reject(err))
            .then((doc:vscode.TextDocument) => {
                deferred.resolve(doc); 
            })
            
        ; 

        return deferred.promise;
    }



        
    /**
     * Opens an editor for a day with the given offset. 
     * @param {number} offset - 0 is today, -1 is yesterday
     */
    public openDay(offset: number) : Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();
        
        if(!isNaN(offset)) deferred.reject("No a valid value for offeset"); 

        console.log("open day with offset ", offset); 


        
        let date = new Date(); 
        date.setDate(date.getDate()+offset); 
        
        let tpl:string =  this.config.get<string>('tpl-page'); 
        let content:string =  tpl.replace('{content}', this.formatDate(date)); 

        this.getDateFile(date)
            .then((path:string) => this.loadTextDocument(path))
            .catch((path:string) => this.createSaveLoadTextDocument(path, content))
            .then((doc:vscode.TextDocument) => {
                this.showDocument(doc);
                deferred.resolve(doc);  
            })
            .catch( (err) => {
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
    public createNote() : Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();
        let options:vscode.InputBoxOptions = {
            prompt: "Enter name for your notes"
        }; 

        vscode.window.showInputBox(options).then(filename => {
            let content:string =  this.config.get<string>('tpl-page').replace('{content}', filename); 

            // replace invalid chars
            filename = filename.replace(/\s/g, '_');
            filename = filename.replace(/\\|\/|\<|\>|\:|\n|\||\?|\*/g, '-'); 
            filename = encodeURIComponent(filename); 

            this.getFilePathInDateFolder(new Date(), filename)
                .then((path:string) => this.loadTextDocument(path))
                .catch((path:string) => this.createSaveLoadTextDocument(path, content))
                .then((doc:vscode.TextDocument) => {
                    this.showDocument(doc); 
                    deferred.resolve(doc); 
                }) 
                .catch( (err) => {
                    vscode.window.showErrorMessage("Failed to create a new note");
                    deferred.reject("Failed");  
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
    public addMemo() : Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();

        let options: vscode.InputBoxOptions = {
            prompt: "Enter memo"
        };
        vscode.window.showInputBox(options).then(input => {
            let content:string =  this.config.get<string>('tpl-memo').replace('{content}', input); 

            this.openDay(0)
                .then((doc:vscode.TextDocument) => {
                    this.injectContent(doc, new vscode.Position(2,0), content);
                    deferred.resolve(doc);  
                })
                .catch(() => {
                    deferred.reject("Failed to add memo"); 
                });
        });  

        return deferred.promise; 
    
    }





    /*********  PRIVATE METHODS FROM HERE *********/

    private showDocument(textDocument:vscode.TextDocument): Q.Promise<vscode.TextEditor> {
        var deferred: Q.Deferred<vscode.TextEditor> = Q.defer<vscode.TextEditor>();

           vscode.window.showTextDocument(textDocument,2,false).then(
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
        let uri:vscode.Uri = vscode.Uri.file(path);
        console.log('Journal: ', 'Creating file: ', uri.fsPath);

        uri = vscode.Uri.parse('untitled:'.concat(uri.fsPath));  
        vscode.workspace.openTextDocument(uri)
            .then((doc:vscode.TextDocument) => this.fillTextDocument(doc, content))
            .then((doc:vscode.TextDocument)  => {
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
            failed => deferred.reject(path) // retiurn path to reuse it later in createDoc
        );

        return deferred.promise;  
    }


    private fillTextDocument(doc: vscode.TextDocument, content: string): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();

        // if textdocument is already loaded, we get the view and insert there, otherwise in the background
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
        

        let c = pos.line-doc.lineCount; 
        // add new lines before injecting (otherwise line count will be ignored) 
        if(c>0) {
            while(c!=0) {
                content = '\n'+content; 
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
            },  failed => {
                deferred.reject("Failed to save file"); 
            })
        }, failed => {
            deferred.reject("Failed to insert memo into file"); 
        });

        return deferred.promise;
    }

    /**
     * Returns the path for a given date
     */
    private getDateFile(date: Date) : Q.Promise<string> {
        var deferred: Q.Deferred<string> = Q.defer<string>();
        deferred.resolve(this.config.get<string>('base')+this.getPathSection(date)+this.config.get<string>('ext')); 
        return deferred.promise;  
    }

    private getFilePathInDateFolder(date: Date, filename: string) : Q.Promise<string> {
        var deferred: Q.Deferred<string> = Q.defer<string>();


        deferred.resolve(
                this.config.get<string>('base')+
                this.getPathSection(date)+'/'+
                filename+
                this.config.get<string>('ext')
                ); 
        return deferred.promise;  
    }

    private getPathSection(date: Date) : string {
        let year = date.getFullYear().toString(); 
        let month = this.prefixZero(date.getMonth()+1); 
        let day = this.prefixZero(date.getDate());
        return '/'+year+'/'+month+'/'+day;  
    }
 

    private prefixZero(nr: number): string {
        let current  = nr.toString();
        if(current.length == 1) current = '0'+current; 
        return current;
    }

    private getLocale(): string {
        let locale:string = this.config.get<string>('locale'); 
        if(locale.length == 0) {
            locale = 'en-US'; 
        }
        return locale; 

    }

    public formatDate(date: Date): string {
        let dateFormatOptions: Intl.DateTimeFormatOptions = {
            weekday: "long",
            year: "numeric", 
            month: "long", 
            day: "numeric"
        }; 

        let locale:string = this.getLocale(); 
        return date.toLocaleDateString  (this.getLocale(), dateFormatOptions); 
    }

    private getDayOfWeekForString(day:string): number {
        day = day.toLowerCase(); 
        if(day.match(/monday|mon|montag/)) return 1;
        if(day.match(/tuesday|tue|dienstag/)) return 2; 
        if(day.match(/wednesday|wed|mittwoch/)) return 3; 
        if(day.match(/thursday|thu|donnerstag/)) return 4; 
        if(day.match(/friday|fri|freitag/)) return 5; 
        if(day.match(/saturday|sat|samstag/)) return 6;
        if(day.match(/sunday|sun|sonntag/)) return 7;
        return -1;           
    }


    
    public resolveOffset(value:string) : Q.Promise<number> {
        let today:Date = new Date();
         

        console.log("Resolving offset for \'", value, "\'");
        
        var deferred: Q.Deferred<number> = Q.defer<number>();

        /** shortcuts */
        if(value.match(/today|tod/)) {
            deferred.resolve(0); 
        } else  if(value.match(/tomorrow|tom/)) {
            deferred.resolve(1); 
        } else if(value.match(/yesterday|yes/)) {
            deferred.resolve(-1); 
        }

        /** offset */
        else if(value.startsWith("+", 0)) {
            let match:string[] = value.match(/^\+\d+$/); 
            if(match.length == 1) {
                deferred.resolve(parseInt(match[0].substring(1, match[0].length)));
            } else {
                deferred.reject("Invalid number for positive offset"); 
            }
        }

        else if(value.startsWith("-", 0)) {
            let match:string[] = value.match(/^\-\d+$/); 
            if(match.length == 1) {
                deferred.resolve(-1*parseInt(match[0].substring(1, match[0].length)));
            } else {
                deferred.reject("Invalid number for positive offset"); 
            }
        }  

        /** weekday (last wednesday, next monday) */
        else if(value.match(/^(next|last).*/)) {
            let tokens:string[] = value.split(" ");
            if(tokens.length <= 1) deferred.reject("Malformed input"); 

            // get name of weekday in input
            let searchedDay = this.getDayOfWeekForString(tokens[1]); 
            let currentDay:number = today.getDay();    

            // toggle mode (next or last)
            let next = (tokens[0].charAt(0)=='n') ? true : false; 

            let diff = searchedDay - currentDay; 


            //   today is wednesday (currentDay = 3)
            // 'last monday' (default day of week: 1)
            if(!next && diff < 0)  {
                // diff = -2 (offset)         
                deferred.resolve(diff);

            // 'last friday' (default day of week: 5)
            } else if(!next && diff >= 0)  {
                // diff = 2; 2-7 = -5 (= offset)
                deferred.resolve(diff-7);

            // 'next monday' (default day of week: 1)
            } else if(next && diff <= 0)  {
                // diff = -2, 7-2 = 5 (offset)
                deferred.resolve(diff+7);

            // 'next friday' (default day of week: 5)
            } else if(next && diff > 0)  {
                // diff = 2 (offset)
                deferred.resolve(diff);
            } 
        }

        /** starts with an at least one digit number, we assume it is a date */
        else if(value.match(/^\d{1,4}.*/)) {
            let todayInMS:number = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());

            let dt:string[] = value.split("-");
         
            
            let year:number, month:number, day:number; 
            if(dt.length >= 3) {
                year = parseInt(dt[0]); 
                month = parseInt(dt[1])-1;
                day = parseInt(dt[2]);
            } else if(dt.length >= 2) {
                month = parseInt(dt[0])-1;
                day= parseInt(dt[1]);
            } else {
                day = parseInt(dt[0]); 
            }  
            
            if(month && (month < 0 || month > 12)) deferred.reject("Invalid value for month"); 
            if(day && (day < 0 || day > 31)) deferred.reject("Invalid value for day");


            let inputInMS:number = 0;
            if(year) {
                // full date with year (e.g. 2016-10-24)
                inputInMS = Date.UTC(parseInt(dt[0]), parseInt(dt[1])-1, parseInt(dt[2]));
            } else if(month) { 
                // month and day (eg. 10-24)
               
                 inputInMS = Date.UTC(today.getFullYear(), parseInt(dt[0])-1, parseInt(dt[1]));
            } else if(day) { 
                // just a day
                inputInMS = Date.UTC(today.getFullYear(), today.getMonth(), parseInt(dt[0]));
            } else {
                deferred.reject("Failed to parse the date"); 
            }
            
            let result:number = Math.floor((inputInMS - todayInMS) / (1000 * 60 * 60 * 24)); 
            deferred.resolve(result);


            // // full date with year (e.g. 2016-10-24) 
            // if(value.match(/^(\d{4})-0?(\d{0,2})-0?(\d{0,2})$/)) {
            //     let dt: string[] = value.split("-");
            //     let inputInMS:number = Date.UTC(parseInt(dt[0]), parseInt(dt[1])-1, parseInt(dt[2]));
            //     deferred.resolve(Math.floor((inputInMS - todayInMS) / (1000 * 60 * 60 * 24)));
            
            // // month and day (eg. 10-24)
            // } else if(value.match(/^0?(\d{0,2})-0?(\d{0,2})$/)) { 
            //     let dt: string[] = value.split("-");
            //     let inputInMS:number = Date.UTC(today.getFullYear(), parseInt(dt[0])-1, parseInt(dt[1]));
            //     deferred.resolve(Math.floor((inputInMS - todayInMS) / (1000 * 60 * 60 * 24)));
            // // just a day
            //  } else if(value.match(/^0?(\d{0,2})$/)) { 
            //     let inputInMS:number = Date.UTC(today.getFullYear(), today.getMonth(), parseInt(value));
            //     let offset = Math.floor((inputInMS - todayInMS) / (1000 * 60 * 60 * 24)); 
            //     deferred.resolve(offset);
            // }

        }  
         
        else {
            deferred.reject("Failed to infer a date from the value "+value); 
        }


        return deferred.promise; 
    }


    private validateDateParameters(p: string[]): string {
        let month:number, day:number; 
        

              
                    

        return ""; 
    }

    /*
    private getInitialText(date: Date) : string {
        let res:string = this.config.get<string>('templateDay'); 

        res = res.replace('{weekday}', this.getWeekDay(date)); 
        res = res.replace('{day}', this.prefixZero(date.getDate())+'');
        res = res.replace('{month}', this.prefixZero(date.getMonth()+1)+'');
        res = res.replace('{year}', date.getFullYear()+'');
        return res; 
    }

    private getWeekDay(date: Date): string {
        let ar:string[] = this.config.get<string[]>('weekdays'); 
        return ar[date.getDay()-1]; 
    }


        oldloadTextDocument(uri: vscode.Uri, prefill: string): PromiseLike<void> {
        return vscode.workspace.openTextDocument(uri).then(textDocument => {
            vscode.window.showTextDocument(textDocument,2,false).then(view => {
                if(view.document.uri.scheme == 'untitled') {
                    // empty file, let's prefill with template
                    view.edit( editbuilder => { 
                        editbuilder.insert(new vscode.Position(0,0), prefill); 
                    }); 
                }
            }); 
            }, 
            failed => {
                if(! uri.toString().startsWith("untitled")) {
                    console.log("Creating file: ",uri.path);
                    // let's try to create file
                    this.oldloadTextDocument(vscode.Uri.parse('untitled:'+uri.fsPath), prefill); 
                } else {
                    console.log("Failed to load or create file: ", uri.toString());
            } 
            }); 
    }

        loadOrCreateTextDocument(uri: vscode.Uri): Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>(); 


        vscode.workspace.openTextDocument(uri).then(textDocument => {
                deferred.resolve(textDocument); 
            }, 
            failed => {
                if(! uri.toString().startsWith("untitled")) {
                    console.log("Creating file: ",uri.path);
                    // let's try to create file
                    return this.loadOrCreateTextDocument(vscode.Uri.parse('untitled:'+uri.fsPath));
                } else {
                    console.log("Failed to load or create file: ", uri.toString());
                    deferred.reject("Failed to load or create file."); 
            } 
        });

        return deferred.promise;  
    }


    */



    


}