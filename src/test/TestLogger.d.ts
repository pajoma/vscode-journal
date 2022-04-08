import { Logger } from "../util/logger";
export declare class TestLogger implements Logger {
    error(message: string, ...optionalParams: any[]): void;
    printError(error: Error): void;
    showChannel(): void;
    debug(message: string, ...optionalParams: any[]): void;
    trace(message: string, ...optionalParams: any[]): void;
}
