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

'use strict';

import * as vscode from 'vscode';
import * as Path from 'path';
import { JournalController } from '../../../shared/model/index';
import { refreshScopeFolders, SCOPE_NAME } from '../scope-folders';

/**
 * Creates a scope: a folder below the scope root (`journal.scopeRoot`). Notes
 * created with `#name Title` are then stored in that folder.
 */
export class CreateScopeCommand implements vscode.Command, vscode.Disposable {
    title: string = 'Create a new scope';
    command: string = 'journal.createScope';

    protected constructor(public ctrl: JournalController) { }

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: JournalController): vscode.Disposable {
        const cmd = new this(ctrl);
        vscode.commands.registerCommand(cmd.command, (name?: string) => cmd.execute(name));
        return cmd;
    }

    /** Returns an error message for an invalid or existing scope name, undefined if the name is fine. */
    public validate(name: string): string | undefined {
        const clean = name.trim().replace(/^#/, '');
        if (!SCOPE_NAME.test(clean)) {
            return vscode.l10n.t("Use letters, digits, '_' and '-' only.");
        }
        if (this.ctrl.config.getScopes().some(scope => scope.toLowerCase() === clean.toLowerCase())) {
            return vscode.l10n.t("The scope #{0} already exists.", clean);
        }
        return undefined;
    }

    /**
     * @param name the scope name (asks for it if omitted)
     * @returns the path of the new scope folder, undefined if cancelled or invalid
     */
    public async execute(name?: string): Promise<string | undefined> {
        this.ctrl.logger.trace("Executing command: ", this.command);
        try {
            const input = name ?? await vscode.window.showInputBox({
                prompt: vscode.l10n.t("Name of the new scope, used as tag for notes (e.g. #projectA)"),
                placeHolder: "projectA",
                validateInput: value => this.validate(value),
            });
            if (input === undefined) { return undefined; }

            const error = this.validate(input);
            if (error) {
                await vscode.window.showWarningMessage(error);
                return undefined;
            }

            const scope = input.trim().replace(/^#/, '');
            const folder = Path.join(this.ctrl.config.getScopeRoot(), scope);
            await this.ctrl.fs.createDirectory(folder);
            // git does not track empty folders
            await this.ctrl.fs.writeFile(Path.join(folder, '.gitkeep'), new Uint8Array());
            await refreshScopeFolders(this.ctrl);

            vscode.window.showInformationMessage(
                vscode.l10n.t("Scope #{0} created. Start a note title with #{0} to store it there.", scope));
            return folder;
        } catch (error) {
            this.ctrl.logger.error("Failed to execute command: ", this.command, "Reason: ", error);
            this.ctrl.ui.showError("Failed to create scope.");
            return undefined;
        }
    }
}
