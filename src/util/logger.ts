// Copyright (C) 2018 Patrick Maué
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


import * as vscode from 'vscode';
import * as J from '../.';
import moment from 'moment';

export class Logger {
    private DEV_MODE = false; 


    constructor(public ctrl: J.Util.Ctrl, public channel: vscode.OutputChannel) {
        this.DEV_MODE = ctrl.config.isDevelopmentModeEnabled();
    }

    public traceLine(message: string, ...optionalParams: any[]): void {
        if (this.DEV_MODE === true) {
            this.appendCurrentTime();
            this.channel.append(" [trace] "); 

            this.channel.append(message); 
            optionalParams.forEach(msg => this.channel.append(msg+"")); 

            this.channel.appendLine(""); 


            console.trace("[TRACE]", message, ...optionalParams);
        }
    }

    public trace(message: string, ...optionalParams: any[]): void {
        if (this.DEV_MODE === true) {
            this.appendCurrentTime();
            this.channel.append(" [trace] "); 

            this.channel.append(message); 
            optionalParams.forEach(msg => this.channel.append(msg+"")); 

            this.channel.appendLine(""); 

            console.info("[TRACE]", message, ...optionalParams);
        }
    }


    public debug(message: string, ...optionalParams: any[]): void {
        if (this.DEV_MODE === true) {
            this.appendCurrentTime();
            this.channel.append(" [debug] "); 

            this.channel.append(message); 
            optionalParams.forEach(msg => this.channel.append(msg)); 

            this.channel.appendLine(""); 

            console.log("[DEBUG]", message, ...optionalParams);
        }
    }

    public printError(error: Error): void {
        this.error(error.message, error); 

   
    }

    public error(message: string, ...optionalParams: any[]): void {

        this.appendCurrentTime();
        this.channel.append(" [ERROR] "); 

        this.channel.append(message); 

        if(optionalParams.length > 0) {
            this.channel.append(" ");
        }
        optionalParams.forEach(msg => {
            if(J.Util.isString(msg)) {
                this.channel.append(msg); 
            }
            else if(J.Util.isError(msg)) { 
                if(J.Util.isNotNullOrUndefined(msg.stack)) {
                    let method: string | undefined = /at \w+\.(\w+)/.exec(msg.stack!.split('\n')[2])?.pop(); 
                    this.channel.append("("+method+")"); 
                }

                this.channel.appendLine("See Exception below."); 
                if(J.Util.isNotNullOrUndefined(msg.stack)) {
                    this.channel.append(msg.stack); 
                }

            }
            else {
                this.channel.appendLine(JSON.stringify(msg)); 
            }
        });
        this.channel.appendLine(""); 

        console.error("[ERROR]", message, ...optionalParams);
    }



    private appendCurrentTime() : void {
        this.channel.append("[");
        this.channel.append(moment(new Date()).format('HH:mm:ss.SSS'));
        this.channel.append("]");
    }
}

