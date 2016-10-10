'use strict';

import * as vscode from 'vscode';
import * as Q from 'q';  

export default class Journal {

    constructor(public config: vscode.WorkspaceConfiguration) {
    }


        
    /**
     * Opens an editor for a day with the given offset. 0 is today, -1 is yesterday
     */
    public openDay(offset: number) : Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();
        let date = new Date(); 
        date.setDate(date.getDate()+offset); 
        
        let dateFormatOptions: Intl.DateTimeFormatOptions = {
            weekday: "long",
            year: "numeric", 
            month: "long", 
            day: "numeric"
        }; 
        let content: string = '# '+date.toLocaleDateString("en-US", dateFormatOptions)+'\n\n';

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
     * 
     */
    public createNote() : Q.Promise<vscode.TextDocument> {
        var deferred: Q.Deferred<vscode.TextDocument> = Q.defer<vscode.TextDocument>();
        let options:vscode.InputBoxOptions = {
            prompt: "Enter name for your notes"
        }; 

        vscode.window.showInputBox(options).then(filename => {
            console.log(filename);

            
            let content:string =  '# '.concat(filename).concat('\n\n'); 

            // replace invalid chars
            let regexp:RegExp = /\s|\\|\/|\<|\>|\:|\n|\||\?|\*/g;
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
 
            // this.loadTextDocument(vscode.Uri.file(path),content);  
                
        }); 
        return deferred.promise; 
    }
    
    addMemo() {
        let options: vscode.InputBoxOptions = {
            prompt: "Enter memo"
        };
        vscode.window.showInputBox(options).then(value => {
            let content = '*  '+value; 

            /* we open the file for now 
            this.getDateFile(new Date())
                .then((path:string) => {

                });
            */ 
            this.openDay(0)
                .then((doc:vscode.TextDocument) => {
                    this.injectContent(doc, new vscode.Position(2,0), content); 
                })
                .catch(() => {
                    vscode.window.showErrorMessage("Failed to add memo");
                });
        });  

    
    }


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
/*               doc.save().then( 
                    () => {
                        console.log("saveDocument");
                        deferred.resolve(doc)
                    }, failed => {
                        deferred.reject("Failed to save created file.");
                    }
                )
                ; */
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
                console.log("Memo added to today's note")
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
        deferred.resolve(this.config.get<string>('base')+this.getPathSection(date)+'/'+filename+this.config.get<string>('ext')); 
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