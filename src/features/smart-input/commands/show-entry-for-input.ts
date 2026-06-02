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
import { JournalController, Input, NoteInput } from '../../../shared/model/index';
import { AbstractLoadEntryForDateCommand } from '../../../shared/commands/abstract-load-entry-command';
import { LoadNotes } from '../../notes/load-note';

/**
 * The smart-input dispatcher (`journal.day`, `Ctrl+Shift+J`). Classifies free
 * text and orchestrates between features by `Input` type — the command layer is
 * where cross-feature dispatch belongs, so it (not the entries base command)
 * routes note inputs to the notes feature.
 */
export class ShowEntryForInputCommand extends AbstractLoadEntryForDateCommand {
    title: string = "Show journal entry for given user input";
    command: string = "journal.day";

    public static create(ctrl: JournalController): vscode.Disposable {
        const cmd = new this(ctrl);
        vscode.commands.registerCommand(cmd.command, () => cmd.execute());
        return cmd;
    }

    /**
     * Opens the editor for a specific day. Supported values are explicit dates (in ISO format),
     * offsets (+ or - as prefix and 0) and weekdays (next wednesday).
     */
    public async execute(): Promise<void> {
        this.ctrl.logger.trace("Executing command: ", this.command);

        const input: Input = await this.ctrl.ui.getUserInputWithValidation();
        super.execute(input);
    }

    /** Adds note-input dispatch on top of the shared entry/week/selected handling. */
    protected async loadPageForInput(input: Input): Promise<vscode.TextDocument> {
        if (input instanceof NoteInput) {
            return new LoadNotes(input, this.ctrl).loadWithPath(input.path);
        }
        return super.loadPageForInput(input);
    }
}
