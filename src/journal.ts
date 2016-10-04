'use strict';

import * as vscode from 'vscode';

export default class Journal {
    public base: string = 'D:/Users/pmaue/_Private/Synced/Notizen/Journal/';  
    public ext: string = '.txt'; 
    public template: string = '= {weekday}, den {day}.{month}.{year} \n\n';
    public weekdays: string[] = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'] 

    constructor() {
        this.registerEvents(); 

    }

    registerEvents() {
    }


    loadTextDocument(uri: vscode.Uri, date: Date): void {
        vscode.workspace.openTextDocument(uri).then(textDocument => {
            vscode.window.showTextDocument(textDocument,2,false).then(view => {
                if(view.document.uri.scheme == 'untitled') {
                    // empty file, let's prefill with template
                    
                    // only if date is parameter, otherwise put entered value in title
                    view.edit( editbuilder => {
                        editbuilder.insert(new vscode.Position(0,0), this.getInitialText(date)); 
                    }); 
                }
            }); 
            }, 
            failed => {
                if(! uri.toString().startsWith("untitled")) {
                    console.log("Creating file: ",uri.path);
                    // let's try to create file
                    this.loadTextDocument(vscode.Uri.parse('untitled:'+uri.fsPath), date); 
                } else {
                    console.log("Failed to load or create file: ", uri.toString());
            }
        }); 
    }

    public createNote() {
        let options:vscode.InputBoxOptions = {
            prompt: "Please enter a name for the notes file."
        }; 

        vscode.window.showInputBox(options).then(value => {
            console.log(value);

            let date = new Date();
            let year = date.getFullYear().toString(); 
            let month = this.prefixZero(date.getMonth()+1); 
            let day = this.prefixZero(date.getDate()); 
            
            let p = this.base.concat(year, '/',month, '/', day, '/', value, this.ext);
            this.loadTextDocument(vscode.Uri.file(p), null);    
        }) 
    }
    
    
    /**
     * Opens an editor for a day with the given offset. 0 is today, -1 is yesterday
     */
    public openDay(offset: number) {
        let date = new Date(); 

        date.setDate(date.getDate()+offset); 
        let year = date.getFullYear().toString(); 
        let month = this.prefixZero(date.getMonth()+1); 
        let day = this.prefixZero(date.getDate()); 

        let p = this.base.concat(year, '/',month, '/', day, this.ext); 
        let location = this.loadTextDocument(vscode.Uri.file(p), date);
    }



    private prefixZero(nr: number): string {
        let current  = nr.toString();
        if(current.length == 1) current = '0'+current; 
        return current;
    }

    private getInitialText(date: Date) : string {
        let res = this.template; 
        
        res = res.replace('{weekday}', this.getWeekDay(date)); 
        res = res.replace('{day}', this.prefixZero(date.getDate())+'');
        res = res.replace('{month}', this.prefixZero(date.getMonth()+1)+'');
        res = res.replace('{year}', date.getFullYear()+'');
        return res; 
    }

    private getWeekDay(date: Date): string {
        let ar = this.weekdays; 
        return this.weekdays[date.getDay()]; 
    }



    


}