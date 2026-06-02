import { Logger } from '../shared/logging/logger';

export class TestLogger implements Logger {
    public readonly errors: string[] = [];

    constructor(public tracing: boolean) {

    }

    error(message: string, ...optionalParams: any[]): void {
        this.errors.push(String(message));
        console.error("ERROR", message, ...optionalParams);
    }
    printError(error: Error): void {
        this.errors.push(error.message);
        console.error("ERROR", error.message);
    }
    showChannel(): void {
        // no-op in tests
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