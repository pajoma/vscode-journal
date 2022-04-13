/// <reference types="node" />
import * as Path from 'path';
/**
 * Utility Methods for the vscode-journal extension
 */
/**
*  Check if config dir exists, otherwise copy defaults from extension directory
*  We can't Q's nfcall, since those nodejs operations don't have (err,data) responses
*
*  fs.exists does only return "true", see https://github.com/petkaantonov/bluebird/issues/418
*  @param path
*/
export declare function checkIfFileIsAccessible(path: string): Promise<void>;
/**
 * Return day of week for given string.
 */
export declare function getDayOfWeekForString(day: string): number;
/**
* Formats a given Date in long format (for Header in journal pages)
*/
export declare function formatDate(date: Date, template: string, locale: string): string;
/**
* Returns target  for notes as string;
*/
export declare function getFilePathInDateFolder(date: Date, filename: string, base: string, ext: string): Promise<string>;
/**
* Returns the path for a given date as string
* @deprecated
*/
export declare function getEntryPathForDate(date: Date, base: string, ext: string): Promise<string>;
export declare function getPathAsString(path: Path.ParsedPath): string;
/**
 * Returns the filename of a given URI.
 * Example: "21" of uri "file://some/path/to/21.md""
 * @param uri
 */
export declare function getFileInURI(uri: string, withExtension?: boolean): string;
export declare function getNextLine(content: string): string[];
/**
 * Returns path to month folder.
 */
export declare function getPathOfMonth(date: Date, base: string): string;
export declare function getDayAsString(date: Date): string;
/**
* Takes a number and a leading 0 if it is only one digit, e.g. 9 -> "09"
*/
export declare function prefixZero(nr: number): string;
/**
 * Returns a normalized filename for given string. Special characters will be replaced.
 * @param input
 */
export declare function normalizeFilename(input: string): string;
/**
 * Converts a filename into its readable form (for file links)
 *
 * @param input the line to convert
 * @param ext the file extension used for notes and journal entries
 */
export declare function denormalizeFilename(input: string): string;
export declare function isNullOrUndefined(value: any | undefined | null): boolean;
export declare function isNotNullOrUndefined(value: any | undefined | null): boolean;
export declare function stringIsNotEmpty(value: string | undefined | null): boolean;
export declare function isString(object: any | string | undefined): boolean;
export declare function isError(object: any | Error | undefined): boolean;
