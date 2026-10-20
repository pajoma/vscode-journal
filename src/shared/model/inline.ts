/** A position in a text: zero-based line and character (as vscode.Position, without vscode). */
export interface TextPosition {
    line: number;
    character: number;
}

/** Replaces the text from start to end with value. */
export interface TextReplacement {
    start: TextPosition;
    end: TextPosition;
    value: string;
}

/** A line rendered from a template with the values (variable, value), and the lines that go directly below it, e.g. sub-tasks. */
export interface TemplateLine {
    values: string[][];
    below?: string[];
}

/** Text to insert into the document at `path`. */
export interface InlineString {
    path: string;
    position: TextPosition;
    value: string;
}
