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

import { IEditor, ILogger, Input, InlineTemplate, InlineString, TemplateLine, TextPosition } from '../../shared/model/index';
import { JournalSettings, JournalTemplates, LINE_KINDS, placeLine, renderNoteHeader, Resolved } from 'journal-core';
import { isNullOrUndefined, unreachable } from '../../shared/lang';
import { DocumentText, isAfterOrEqual, replacementFor } from '../../shared/text/document-text';


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
                case 'memo': {
                    const tpl = this.config.getMemoInlineTemplate();
                    await this.place(path, tpl, LINE_KINDS.memo(tpl.template), [{ values: [["${input}", input.text]] }]);
                    return path;
                }
                case 'task':
                    await this.place(path, this.config.getTaskInlineTemplate(), LINE_KINDS.task, [{ values: [["${input}", input.text]] }]);
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
     * Adds lines rendered from the template at its `after` anchor (or below
     * the title), as journal-core places them for the MCP server too (#320):
     * after the lines of the same kind, oldest first. A missing anchor heading
     * is created. Each line's `below` lines go directly under it; all as one edit.
     */
    public async place(path: string, tpl: Resolved<InlineTemplate>, sameKind: (line: string) => boolean, lines: TemplateLine[]): Promise<void> {
        this.logger.trace("Entering place() in inject.ts with InlineTemplate: ", JSON.stringify(tpl), " and lines ", JSON.stringify(lines));

        const text = await this.editor.getText(path);
        const eol = text.includes('\r\n') ? '\r\n' : '\n';
        const result = text.split(/\r?\n/);
        for (const { values, below } of lines) {
            let content = tpl.value;
            values.forEach(([variable, value]) => { content = content.replace(variable, value); });
            const [first, ...rest] = content.replace(/\s+$/, '').split(/\r?\n/);
            const at = placeLine(result, first, tpl.after, sameKind);
            result.splice(at + 1, 0, ...rest, ...(below ?? []));
        }
        const edit = replacementFor(text, result.join(eol));
        if (edit) {
            await this.editor.replace(path, edit);
        }
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
        return renderNoteHeader(template, input.text, input.tags, input.anchorDate(this.config.getLocale()), this.config.getLocale()) + '\n\n';
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
