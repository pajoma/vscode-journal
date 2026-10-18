// Copyright (C) 2021  Patrick Maué
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
import { JournalController } from '../../../shared/model/index';
import { AbstractLoadEntryForDateCommand } from '../../../shared/commands/load-entry-for-date';

/**
 * The smart search (#300): finds entries, weekly entries and notes of all
 * journal folders by name and text, newest first, in every window. Also a row
 * of the smart input; this command can be bound to its own key.
 */
export class SearchJournalCommand extends AbstractLoadEntryForDateCommand {
    title: string = "Search journal";
    command: string = "journal.search";

    public static create(ctrl: JournalController): vscode.Disposable {
        const cmd = new this(ctrl);
        vscode.commands.registerCommand(cmd.command, () => cmd.run());
        return cmd;
    }

    public async run(): Promise<void> {
        this.ctrl.logger.trace("Executing command: ", this.command);
        if (!this.ctrl.config.getSearchSettings().enabled) {
            const open = vscode.l10n.t("Open Settings");
            const answer = await vscode.window.showInformationMessage(vscode.l10n.t("The journal search is turned off (journal.search.enabled)."), open);
            if (answer === open) { await vscode.commands.executeCommand('workbench.action.openSettings', 'journal.search'); }
            return;
        }
        const input = await this.ctrl.ui.search();
        if (!input) { return; }
        await this.execute(input);
    }
}
