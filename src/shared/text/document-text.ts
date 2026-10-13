// Copyright (C) 2026 Patrick Maué
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

'use strict';

import { TextPosition } from '../model/inline';

/**
 * Lines and positions of a text, with the semantics of vscode.TextDocument
 * (validatePosition, positionAt, lineAt), so that text edits can be computed
 * without VS Code (#239). Line breaks may be \n or \r\n.
 */
export class DocumentText {
    private readonly lines: string[];
    /** Offset of the first character of each line. */
    private readonly starts: number[];

    constructor(private readonly text: string) {
        this.lines = [];
        this.starts = [];
        const lineBreak = /\r?\n/g;
        let start = 0;
        let match: RegExpExecArray | null;
        while ((match = lineBreak.exec(text)) !== null) {
            this.lines.push(text.slice(start, match.index));
            this.starts.push(start);
            start = match.index + match[0].length;
        }
        this.lines.push(text.slice(start));
        this.starts.push(start);
    }

    get lineCount(): number {
        return this.lines.length;
    }

    lineText(line: number): string {
        return this.lines[line];
    }

    isEmptyOrWhitespace(line: number): boolean {
        return this.lines[line].trim().length === 0;
    }

    /** The end of the last line. */
    end(): TextPosition {
        const line = this.lines.length - 1;
        return { line, character: this.lines[line].length };
    }

    /** The position of an offset, clamped to the text. */
    positionAt(offset: number): TextPosition {
        const clamped = Math.max(0, Math.min(offset, this.text.length));
        let line = 0;
        while (line + 1 < this.starts.length && this.starts[line + 1] <= clamped) { line++; }
        return { line, character: Math.min(clamped - this.starts[line], this.lines[line].length) };
    }

    /** The position clamped to the text: beyond the last line is the end of the text. */
    validate(position: TextPosition): TextPosition {
        if (position.line < 0) { return { line: 0, character: 0 }; }
        if (position.line >= this.lines.length) { return this.end(); }
        const length = this.lines[position.line].length;
        return { line: position.line, character: Math.max(0, Math.min(position.character, length)) };
    }
}

/** a is at or after b. */
export function isAfterOrEqual(a: TextPosition, b: TextPosition): boolean {
    return a.line > b.line || (a.line === b.line && a.character >= b.character);
}
