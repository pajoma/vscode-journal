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
import { IConfiguration, IEditor, ILogger, InlineString } from '../model/index';

/**
 * The text documents of VS Code, by file path (#239): the only place that
 * opens, edits, saves and shows them. An open document (also an untitled one,
 * by its fsPath) is used as it is in the editor, unsaved changes included.
 */
export class VscodeEditor implements IEditor {

    constructor(private readonly config: IConfiguration, private readonly logger: ILogger) { }

    private async document(path: string): Promise<vscode.TextDocument> {
        const open = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === path);
        return open ?? vscode.workspace.openTextDocument(vscode.Uri.file(path));
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
        if (!(await vscode.workspace.applyEdit(edit))) {
            this.logger.error("Failed to insert '", inserts[0].value, "' into ", inserts[0].path);
            throw new Error("Failed to apply edit");
        }
    }

    public async save(path: string): Promise<void> {
        const doc = await this.document(path);
        if (doc.isDirty && !(await doc.save())) {
            throw new Error("Failed to save file with path: " + path);
        }
    }

    public async show(path: string): Promise<void> {
        const doc = await this.document(path);
        this.logger.trace("Entering show() in shared/editor for document: ", doc.fileName);

        if (doc.isDirty) { doc.save(); }

        const existing = vscode.window.visibleTextEditors.find(editor => doc.fileName.startsWith(editor.document.fileName));
        if (existing) {
            this.logger.debug("Document  ", doc.fileName, " is already opened.");
            return;
        }

        const column = this.config.isOpenInNewEditorGroup() ? 2 : 1;
        await vscode.window.showTextDocument(doc, column, false);
        vscode.commands.executeCommand("cursorMove", { to: "down", by: "line", value: doc.lineCount });
        this.logger.debug("Showed document  ", doc.fileName);
    }
}
