// Copyright (C) 2018  Patrick Maué
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
import { IEditor, IFileSystem, ILogger, InlineString } from '../model';
import { isNullOrUndefined } from '../index';

/**
 * The single seam between the journal domain and the VS Code editor surface.
 * Owns opening / creating / saving `TextDocument`s and applying edits, so the
 * domain code (reader/writer/inject) can work in terms of paths and plain data
 * (#239).
 */
export class EditorAdapter implements IEditor {

    constructor(private readonly logger: ILogger, private readonly fs: IFileSystem) { }

    public async open(path: string | vscode.Uri): Promise<vscode.TextDocument> {
        if (!(path instanceof vscode.Uri)) { path = vscode.Uri.file(path); }
        return vscode.workspace.openTextDocument(path);
    }

    public async save(doc: vscode.TextDocument): Promise<vscode.TextDocument> {
        if (!doc.isDirty) { return doc; }
        const isSaved = await doc.save();
        if (isSaved) { return doc; }
        throw new Error("Failed to save file with path: " + doc.fileName);
    }

    public async createAndOpen(path: string, content: string): Promise<vscode.TextDocument> {
        this.logger.trace("Entering createAndOpen() in editor-adapter.ts for path: ", path);
        await this.fs.writeFile(path, new TextEncoder().encode(content));
        const doc = await this.open(path);
        this.logger.debug("Opened new file with name: ", doc.fileName);
        return doc;
    }

    public async applyInlineStrings(content: InlineString, ...other: InlineString[]): Promise<vscode.TextDocument> {
        this.logger.trace("Entering applyInlineStrings() in editor-adapter.ts with string: ", content.value.trim());

        if (isNullOrUndefined(content)) {
            this.logger.error("Content is null");
            throw new Error("Invalid call, no reference to document due to null content.");
        }

        const edit = new vscode.WorkspaceEdit();
        edit.insert(content.document.uri, content.position, content.value);
        if (!isNullOrUndefined(other) && other.length > 0) {
            other.forEach(additional => edit.insert(additional.document.uri, additional.position, additional.value));
        }

        if (isNullOrUndefined(edit) || edit.size === 0) {
            this.logger.trace("No changes have been made to the document: ", content.document.fileName);
            return content.document;
        }

        const applied = await vscode.workspace.applyEdit(edit);
        if (!applied) {
            this.logger.error("Failed inject inline string '", content.value, "'");
            throw new Error("Failed to applied edit");
        }
        return content.document;
    }
}
