import { Logger } from "../util/logger";

export class TestLogger implements Logger {
    error(message: string, ...optionalParams: any[]): void {
        console.error(message, optionalParams); 
    }
    printError(error: Error): void {
        throw new Error("Method not implemented.");
    }
    showChannel(): void {
        throw new Error("Method not implemented.");
    }
    debug(message: string, ...optionalParams: any[]): void {
        console.debug(message, optionalParams); 
    }
    trace(message: string, ...optionalParams: any[]): void {
        console.trace(message, optionalParams); 
    }

}