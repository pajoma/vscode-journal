'use strict';

import * as vscode from 'vscode';

export default class Journal {
    public base: string = 'D:/Users/pmaue/_Private/Synced/Notizen/Journal/';  
    public ext: string = '.txt'; 

    loadTextDocument(uri: vscode.Uri): string | Thenable<string> {
        // get file
        /*  
        vscode.commands.getCommands(false).then(array => {
            array.forEach(entry => {
                console.log(entry);
                
            })
        });
        */ 
        vscode.workspace.onDidOpenTextDocument( event => {
            console.log("loaded file2: ", JSON.stringify(event));
        }); 


        vscode.workspace.openTextDocument(uri).then(textDocument => {
            vscode.window.showTextDocument(textDocument,1,false).then(view => {
                console.log("displayed file: ", JSON.stringify(view));
            }); 
            }, failed => {
                console.log("failed file: ", failed);
            }); 

        return new Date().getDay().toLocaleString();



    }

    today() {
        let date = new Date(); 
        let year = date.getFullYear().toString(); 
        let month = this.prefixZero(date.getMonth()+1); 
        let day = this.prefixZero(date.getDate()); 

        
        let p = this.base.concat(year, '/',month, '/', day, this.ext); 
        console.log('Today\'s path: ', p); 
        let location = this.loadTextDocument(vscode.Uri.file(p)); 
    }



    private prefixZero(nr: number): string {
        let current  = nr.toString();
        if(current.length == 1) current = '0'+current; 
        return current;
    }


}