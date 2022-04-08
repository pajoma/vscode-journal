import { Logger } from "../util/logger";

export class TestLogger implements Logger {
    constructor(public tracing: boolean) {

    }

    error(message: string, ...optionalParams: any[]): void {
        console.error("ERROR", message, ...optionalParams); 
    }
    printError(error: Error): void {
        throw new Error("Method not implemented.");
    }
    showChannel(): void {
        throw new Error("Method not implemented.");
    }
    debug(message: string, ...optionalParams: any[]): void {
        console.debug("DEBUG", message, ...optionalParams); 
    }
    trace(message: string, ...optionalParams: any[]): void {
        if(this.tracing) {
            console.trace(message, ...optionalParams); 
        }
        // do nothing

    }

}