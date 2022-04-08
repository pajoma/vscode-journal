export declare class Input {
    private _offset;
    private _flags;
    private _text;
    private _scope;
    private _tags;
    constructor(offset?: number);
    /**
     * Getter offset
     * @return {number }
     */
    get offset(): number;
    get tags(): string[];
    /**
     * Getter flags
     * @return {string }
     */
    get flags(): string;
    /**
     * Getter text
     * @return {string }
     */
    get text(): string;
    /**
     * Getter scope
     * @return {string }
     */
    get scope(): string;
    /**
     * Setter offset
     * @param {number } value
     */
    set offset(value: number);
    /**
     * Setter flags
     * @param {string } value
     */
    set flags(value: string);
    /**
     * Setter text
     * @param {string } value
     */
    set text(value: string);
    set tags(values: string[]);
    /**
     * Setter scope
     * @param {string } value
     */
    set scope(value: string);
    hasMemo(): boolean;
    hasFlags(): boolean;
    hasOffset(): boolean;
    hasTask(): boolean;
    generateDate(): Date;
}
export declare class NoteInput extends Input {
    private _path;
    constructor();
    get path(): string;
    set path(path: string);
}
export declare class SelectedInput extends Input {
    private _selected;
    private _path;
    get selected(): boolean;
    get path(): string;
    constructor(path: string);
}
