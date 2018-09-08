import { DEV_MODE } from './util';


import * as vscode from 'vscode';
import * as Q from 'q';
import * as J from '../.';
import * as moment from 'moment'; 

export class Logger {
    private DEV_MODE = false; 


    constructor(public ctrl: J.Util.Ctrl, public channel: vscode.OutputChannel) {
        this.DEV_MODE = ctrl.config.isDevelopmentModeEnabled();
    }

    public trace(message: any, ...optionalParams: any[]): void {
        if (DEV_MODE) {
            this.appendCurrentTime();
            this.channel.append(" [trace] "); 

            this.channel.append(message); 
            optionalParams.forEach(msg => this.channel.append(msg)); 

            this.channel.appendLine(""); 

            console.info("[TRACE]", message, ...optionalParams)
        }
    }

    public debug(message: any, ...optionalParams: any[]): void {
        if (DEV_MODE) {
            this.appendCurrentTime();
            this.channel.append(" [debug] "); 

            this.channel.append(message); 
            optionalParams.forEach(msg => this.channel.append(msg)); 

            this.channel.appendLine(""); 

            console.log("[DEBUG]", message, ...optionalParams)
        }
    }

    public error(message: any, ...optionalParams: any[]): void {
        this.appendCurrentTime();
        this.channel.append(" [debug] "); 

        this.channel.append(message); 
        optionalParams.forEach(msg => this.channel.append(msg)); 

        this.channel.appendLine(""); 

        console.error("[JOURNAL]", message, ...optionalParams)
    }



    private appendCurrentTime() : void {
        this.channel.append("[")
        this.channel.append(moment(new Date()).format('HH:mm:ss.SSS'))
        this.channel.append("]")
    }
}

