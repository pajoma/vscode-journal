/** A position in a text: zero-based line and character (as vscode.Position, without vscode). */
export interface TextPosition {
    line: number;
    character: number;
}

/** Text to insert into the document at `path`. */
export interface InlineString {
    path: string;
    position: TextPosition;
    value: string;
}
