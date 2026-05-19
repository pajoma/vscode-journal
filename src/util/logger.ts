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
import { IConfiguration } from '../model';
import { isString } from './strings';
import { isError, isNotNullOrUndefined } from './util';

export interface Logger {
    trace(message: string, ...optionalParams: any[]): void; 
    debug(message: string, ...optionalParams: any[]): void; 
    error(message: string, ...optionalParams: any[]): void; 
    printError(error: Error): void;
    showChannel(): void;
}



export class ConsoleLogger implements Logger {
    private devMode = false; 


    constructor(private config: IConfiguration, public channel: vscode.OutputChannel) {
        this.devMode = config.isDevelopmentModeEnabled();
    }

    public showChannel(): void {
        this.channel.show(); 
    }

    public traceLine(message: string, ...optionalParams: any[]): void {
        if (this.devMode === true) {
            this.appendCurrentTime();
            this.channel.append(" [trace] "); 

            this.channel.append(message); 
            optionalParams.forEach(msg => this.channel.append(msg+"")); 

            this.channel.appendLine(""); 


            console.trace("[TRACE]", message, ...optionalParams);
        }
    }

    public trace(message: string, ...optionalParams: any[]): void {
        if (this.devMode === true) {
            this.appendCurrentTime();
            this.channel.append(" [trace] "); 

            this.channel.append(message); 
            optionalParams.forEach(msg => this.channel.append(msg+"")); 

            this.channel.appendLine(""); 

            console.info("[TRACE]", message, ...optionalParams);
        }
    }


    public debug(message: string, ...optionalParams: any[]): void {
        if (this.devMode === true) {
            this.appendCurrentTime();
            this.channel.append(" [debug] "); 

            this.channel.append(message); 
            optionalParams.forEach(msg => this.channel.append(msg+"")); 

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
            if(isString(msg)) {
                this.channel.append(msg+""); 
            }
            else if(isError(msg)) { 
                if(isNotNullOrUndefined(msg.stack)) {
                    let method: string | undefined = /at \w+\.(\w+)/.exec(msg.stack!.split('\n')[2])?.pop(); 
                    this.channel.append("("+method+")"); 
                }

                this.channel.appendLine("See Exception below."); 
                if(isNotNullOrUndefined(msg.stack)) {
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
        // HH:mm:ss.SSS — native to drop moment from the activation path (#187)
        const d = new Date();
        const pad = (n: number, w: number = 2) => String(n).padStart(w, '0');
        const stamp = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
        this.channel.append("[");
        this.channel.append(stamp);
        this.channel.append("]");
    }
}

