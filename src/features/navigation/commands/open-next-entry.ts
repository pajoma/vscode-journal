// Copyright (C) 2026  Patrick Maué
//
// This file is part of vscode-journal.
//
// vscode-journal is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

'use strict';

import * as vscode from 'vscode';
import { JournalController, Input } from '../../../shared/model/index';
import { AbstractLoadEntryForDateCommand } from '../../entries/commands/show-entry-for-date';
import { daysBetween, findAdjacentEntry, getAdjacentWeekInput, resolveAnchor, Mode } from '../navigation';

export class OpenNextEntryCommand extends AbstractLoadEntryForDateCommand {
    title: string = "Open the next journal entry";
    command: string = "journal.openNext";

    public static create(ctrl: JournalController): vscode.Disposable {
        const cmd = new this(ctrl);
        vscode.commands.registerCommand(cmd.command, () => cmd.run());
        return cmd;
    }

    public async run(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        const weekInput = await getAdjacentWeekInput(editor, this.ctrl, 'next');
        if (weekInput) { await this.execute(weekInput); return; }

        const mode: Mode = this.ctrl.config.getNavigationMode();
        const anchor = await resolveAnchor(this.ctrl, editor);
        const target = await findAdjacentEntry(this.ctrl, anchor, 'next', mode);
        if (target === null) {
            await vscode.window.showInformationMessage(vscode.l10n.t("No later journal entry found."));
            return;
        }
        const input = new Input();
        input.date = target;
        input.scope = anchor.scope;
        await this.execute(input);
    }
}
