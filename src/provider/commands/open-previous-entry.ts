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
import * as J from '../..';
import { AbstractLoadEntryForDateCommand } from './show-entry-for-date';
import { daysBetween, findAdjacentEntry, resolveAnchor, Mode } from '../../actions/navigation';

export class OpenPreviousEntryCommand extends AbstractLoadEntryForDateCommand {
    title: string = "Open the previous journal entry";
    command: string = "journal.openPrevious";

    public static create(ctrl: J.Util.Ctrl): vscode.Disposable {
        const cmd = new this(ctrl);
        vscode.commands.registerCommand(cmd.command, () => cmd.run());
        return cmd;
    }

    public async run(): Promise<void> {
        const mode = (vscode.workspace.getConfiguration('journal').get<string>('navigation.mode') ?? 'existing') as Mode;
        const anchor = await resolveAnchor(this.ctrl, vscode.window.activeTextEditor);
        const target = await findAdjacentEntry(this.ctrl, anchor, 'previous', mode);
        if (target === null) {
            await vscode.window.showInformationMessage(vscode.l10n.t("No earlier journal entry found."));
            return;
        }
        const input = new J.Model.Input();
        input.offset = daysBetween(new Date(), target);
        await this.execute(input);
    }
}
