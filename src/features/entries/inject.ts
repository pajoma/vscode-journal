// Copyright (C) 2018 Patrick Maué
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

import { IEditor, ILogger, Input, InlineTemplate, InlineString, TextPosition } from '../../shared/model/index';
import { JournalSettings, JournalTemplates, renderNoteHeader, Resolved } from 'journal-core';
import { isNullOrUndefined, unreachable } from '../../shared/lang';
import { DocumentText, isAfterOrEqual } from '../../shared/text/document-text';


/**
 * Inserts memos, tasks, links and other text into documents. Computes where
 * and what from the document's text; the editor applies the inserts (#239).
 */
export class Inject {

    constructor(private config: JournalTemplates & Pick<JournalSettings, 'getLocale'>, private logger: ILogger, private editor: IEditor) {
    }

    /**
     * Adds a new memo or task to the page at `path`. A memo/task is a one liner (entered in input box),
     * which can be used to quickly write down ToDos without leaving your current
     * document.
     *
     * @returns the path of the page
     */
    public async injectInput(path: string, input: Input): Promise<string> {
        this.logger.trace("Entering injectInput() in inject.ts with Input:", JSON.stringify(input));

        // a memo or task without text adds nothing
        if (!input.hasText()) {
            return path;
        }

        try {
            switch (input.kind) {
                case 'memo':
                    await this.injectInlineString(await this.buildInlineString(path, this.config.getMemoInlineTemplate(), ["${input}", input.text]));
                    return path;
                case 'task':
                    await this.injectInlineString(await this.buildInlineString(path, this.config.getTaskInlineTemplate(), ["${input}", input.text]));
                    return path;
                case 'entry':
                case 'note':
                case 'selected':
                    // nothing to add
                    return path;
                default:
                    return unreachable(input.kind);
            }
        } catch (error) {
            if (error instanceof Error) {
                this.logger.error(error.message);
            }
            throw error;
        }
    }



    /**
     * Builds inline string from given input for the document at `path`. Computes the position at the location configured in the Inline Template (the "after"-flag). If no after is present,
     * content will be injected after the header
     *
     * Updates: Fix for  #55, always make sure there is a linebreak between the header and the injected text to stay markdown compliant
     */
    public async buildInlineString(path: string, tpl: Resolved<InlineTemplate>, ...values: string[][]): Promise<InlineString> {
        this.logger.trace("Entering buildInlineString() in inject.ts with InlineTemplate: ", JSON.stringify(tpl), " and values ", JSON.stringify(values));

        let content: string = tpl.value;
        values.forEach((val: string[]) => {
            content = content.replace(val[0], val[1]);
        });
        content = this.adjustLineBreak(tpl, content);

        return {
            position: this.computePositionForInput(await this.editor.getText(path), tpl),
            value: content,
            path,
        };
    }

    public adjustLineBreak(tpl: InlineTemplate, content: string): string {
        // if (tpl-after) is empty, we will inject directly after header
        if (tpl.after.length !== 0) {
            if (tpl.after.startsWith("#")) {
                // fix for #55, always place a linebreak for injected text in markdown
                content = '\n' + content;
            }
        } else {
            // fix for #55, always place a linebreak for injected text after the header
            content = '\n' + content;
        }
        return content;
    }

    public computePositionForInput(text: string, tpl: InlineTemplate): TextPosition {
        // if (tpl-after) is empty, we will inject directly after header
        let position: TextPosition = { line: 1, character: 0 };
        if (tpl.after.length !== 0) {
            const offset: number = text.indexOf(tpl.after);
            if (offset > 0) {
                const doc = new DocumentText(text);
                const found = doc.validate(doc.positionAt(offset));
                position = { line: found.line + 1, character: found.character };
            }
        }
        return position;
    }

    /**
     * Injects a string into the given position within the document at `path`.
     */
    public async injectString(path: string, content: string, position: TextPosition): Promise<void> {
        return this.injectInlineString({ path, position, value: content });
    }


    /**
     * Injects the string at the given position (adjusting line breaks, see
     * {@link formatInsert}), together with the other strings, as one edit.
     */
    public async injectInlineString(content: InlineString, ...other: InlineString[]): Promise<void> {
        if (isNullOrUndefined(content)) {
            this.logger.error("Content is null");
            throw new Error("Invalid call, no reference to document due to null content.");
        }
        this.logger.trace("Entering injectInlineString() in inject.ts with string: ", content.value.trim());

        const formatted = formatInsert(new DocumentText(await this.editor.getText(content.path)), content);
        await this.editor.insert([formatted, ...other]);
    }


    /**
     * Builds the content of newly created notes file using the (scoped) configuration and the user input,
     * as journal-core renders it (#250), followed by an empty line to write in.
     *
     * @param {Input} input what the user has entered
     * @returns {Promise<string>} the built content
     */
    public async formatNote(input: Input): Promise<string> {
        this.logger.trace("Entering formatNote() in inject.ts with input: ", JSON.stringify(input));
        const template = this.config.getNotesTemplate(input.scope).template;
        return renderNoteHeader(template, input.text, input.tags, input.generateDate(), this.config.getLocale()) + '\n\n';
    }
}

/**
 * Adjusts an insert to the document's lines: a position beyond the text goes
 * to its end; a string inserted at the start of an occupied line gets its own
 * line; a following markdown heading is kept apart by a blank line.
 */
export function formatInsert(doc: DocumentText, content: InlineString): InlineString {
    let position: TextPosition = content.position ?? { line: 1, character: 0 };
    let value = content.value;

    // if string to be injected at position zero, we assume a request for a new line (if requested line is occupied)
    const newLine = position.character === 0;

    // if target line exceeds document length, we always inject at the end of the last line
    position = doc.validate(position);

    // shift (inject line break) if line is occupied
    if (newLine && !doc.isEmptyOrWhitespace(position.line)) {
        // if we are at end of the file we prefix another linebreak to make room
        if (isAfterOrEqual(position, doc.end())) {
            value = '\n' + value;
        }
        value = value + '\n';
    }

    // if following line is a header, we insert another linebreak at the end of the string
    if (newLine && doc.lineCount > position.line + 1 && doc.lineText(position.line + 1).search(/^#+\s+.*$/) >= 0) {
        value = value + '\n';
    }

    return { path: content.path, position, value };
}
