// Copyright (C) 2026  Patrick Maué
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
import { JournalController } from '../../../shared/model/index';
import { TokenStore } from '../client';

type SetTokenDeps = Pick<JournalController, 'logger'>;

/** Asks for the token of the Local REST API and keeps it in the secret storage of VS Code. */
export class SetTokenCommand implements vscode.Command, vscode.Disposable {
    title: string = 'Set Super Productivity API Token';
    command: string = 'journal.setSuperProductivityToken';

    protected constructor(public ctrl: SetTokenDeps, private readonly tokens: TokenStore) { }

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: SetTokenDeps, tokens: TokenStore): vscode.Disposable {
        const cmd = new this(ctrl, tokens);
        vscode.commands.registerCommand(cmd.command, () => cmd.execute());
        return cmd;
    }

    public async execute(): Promise<void> {
        this.ctrl.logger.trace("Executing command: ", this.command);
        const token = await vscode.window.showInputBox({
            prompt: vscode.l10n.t("Token of the Local REST API (in the settings of Super Productivity)"),
            password: true,
            ignoreFocusOut: true,
        });
        if (!token?.trim()) { return; }
        await this.tokens.store(token.trim());
        vscode.window.showInformationMessage(vscode.l10n.t("The API token for Super Productivity is stored."));
    }
}
