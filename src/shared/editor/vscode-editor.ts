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

import * as vscode from 'vscode';
import { EditorSettings, IEditor, ILogger, InlineString, TextReplacement } from '../model/index';

/**
 * The text documents of VS Code, by file path (#239), see IEditor. An open
 * document (also an untitled one, by its fsPath) is used as it is in the
 * editor, unsaved changes included.
 */
export class VscodeEditor implements IEditor {

    constructor(private readonly config: EditorSettings, private readonly logger: ILogger) { }

    /**
     * The document of the file at `path` (its buffer if open), or the untitled
     * document of that name. Other documents with the same fsPath, like the
     * `git:` side of a diff editor, are not it.
     */
    private async document(path: string): Promise<vscode.TextDocument> {
        const untitled = vscode.workspace.textDocuments.find(doc => doc.uri.scheme === 'untitled' && doc.uri.fsPath === path);
        return untitled ?? vscode.workspace.openTextDocument(vscode.Uri.file(path));
    }

    public async getText(path: string): Promise<string> {
        return (await this.document(path)).getText();
    }

    public async insert(inserts: InlineString[]): Promise<void> {
        if (inserts.length === 0) { return; }
        const edit = new vscode.WorkspaceEdit();
        for (const insert of inserts) {
            const doc = await this.document(insert.path);
            edit.insert(doc.uri, new vscode.Position(insert.position.line, insert.position.character), insert.value);
        }
        await this.apply(edit, `insert '${inserts[0].value}' into ${inserts[0].path}`);
    }

    public async replace(path: string, replacement: TextReplacement): Promise<void> {
        const { start, end, value } = replacement;
        const doc = await this.document(path);
        const edit = new vscode.WorkspaceEdit();
        edit.replace(doc.uri, new vscode.Range(start.line, start.character, end.line, end.character), value);
        await this.apply(edit, `replace text in ${path}`);
    }

    private async apply(edit: vscode.WorkspaceEdit, what: string): Promise<void> {
        if (!(await vscode.workspace.applyEdit(edit))) {
            this.logger.error("Failed to", what);
            throw new Error("Failed to apply edit");
        }
    }

    public async save(path: string): Promise<void> {
        const doc = await this.document(path);
        if (doc.isDirty && !(await doc.save())) {
            throw new Error("Failed to save file with path: " + path);
        }
    }

    public async show(path: string, line?: number): Promise<void> {
        const doc = await this.document(path);
        this.logger.trace("Entering show() in shared/editor for document: ", doc.fileName);

        await this.save(path);

        const existing = vscode.window.visibleTextEditors.find(editor => doc.fileName.startsWith(editor.document.fileName));
        if (existing && line === undefined) {
            this.logger.debug("Document  ", doc.fileName, " is already opened.");
            return;
        }

        const column = existing?.viewColumn ?? (this.config.isOpenInNewEditorGroup() ? 2 : 1);
        const editor = await vscode.window.showTextDocument(doc, column, false);
        if (line === undefined) {
            await vscode.commands.executeCommand("cursorMove", { to: "down", by: "line", value: doc.lineCount });
        } else {
            const position = doc.validatePosition(new vscode.Position(line, 0));
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        }
        this.logger.debug("Showed document  ", doc.fileName);
    }
}
