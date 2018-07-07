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
import * as moment from 'moment'; 
import { isString, isError, isNullOrUndefined } from 'util';

export class Logger {
    private DEV_MODE = false; 


    constructor(public ctrl: J.Util.Ctrl, public channel: vscode.OutputChannel) {
        this.DEV_MODE = ctrl.config.isDevelopmentModeEnabled();
    }

    public trace(message: any, ...optionalParams: any[]): void {
        if (this.DEV_MODE === true) {
            this.appendCurrentTime();
            this.channel.append(" [trace] "); 

            this.channel.append(message); 
            optionalParams.forEach(msg => this.channel.append(msg+"")); 

            this.channel.appendLine(""); 

            console.info("[TRACE]", message, ...optionalParams);
        }
    }

    public debug(message: any, ...optionalParams: any[]): void {
        if (this.DEV_MODE === true) {
            this.appendCurrentTime();
            this.channel.append(" [debug] "); 

            this.channel.append(message); 
            optionalParams.forEach(msg => this.channel.append(msg)); 

            this.channel.appendLine(""); 

            console.log("[DEBUG]", message, ...optionalParams);
        }
    }

    public error(message: any, ...optionalParams: any[]): void {
        this.appendCurrentTime();
        this.channel.append(" [ERROR] "); 

        this.channel.append(message); 

        if(optionalParams.length > 0) {
            this.channel.append(" ");
        }
        optionalParams.forEach(msg => {
            if(isString(msg)) {
                this.channel.append(msg); 
            }
            else if(isError(msg)) { 
                this.channel.appendLine("See Exception below."); 
                if(! isNullOrUndefined(msg.stack)) {
                    this.channel.append(msg.stack); 
                }
            }
            else {
                this.channel.appendLine(JSON.stringify(msg)); 
            }
        });
        this.channel.appendLine(""); 

        console.error("[JOURNAL]", message, ...optionalParams);
    }



    private appendCurrentTime() : void {
        this.channel.append("[");
        this.channel.append(moment(new Date()).format('HH:mm:ss.SSS'));
        this.channel.append("]");
    }
}

