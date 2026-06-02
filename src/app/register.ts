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
import { Container } from './container';
import {
    OpenJournalWorkspaceCommand, OpenNextEntryCommand, OpenPreviousEntryCommand,
    PrintDurationCommand, PrintSumCommand, PrintTimeCommand, ShiftTaskCommand,
    ShowEntryForInputCommand, ShowEntryForTodayCommand, ShowEntryForTomorrowCommand,
    ShowEntryForYesterdayCommand, ShowNoteCommand,
} from '../commands';
import { SyncDailyLinks, SyncNoteLinks, WeeklyEntryWatcher } from '../features';
import { CompletedTaskActions, OpenTaskActions } from '../ui';

const MARKDOWN_SELECTOR: vscode.DocumentSelector = { scheme: 'file', language: 'markdown' };

/** Registers all journal commands and the weekly/note sync wiring. */
export function registerCommands(ctrl: Container, context: vscode.ExtensionContext): void {
    ctrl.logger.trace("Entering registerCommands() in app/register.ts");

    ctrl.reader.onNotesInjected = (doc, date) => {
        new SyncNoteLinks(ctrl).injectAttachmentLinks(doc, date)
            .finally(() => ctrl.logger.trace("Scanning notes completed"));
    };

    const syncDailyLinks = new SyncDailyLinks(ctrl);
    context.subscriptions.push(new WeeklyEntryWatcher(ctrl, syncDailyLinks));

    context.subscriptions.push(
        OpenJournalWorkspaceCommand.create(ctrl),
        PrintTimeCommand.create(ctrl),
        PrintSumCommand.create(ctrl),
        PrintDurationCommand.create(ctrl),
        ShowEntryForInputCommand.create(ctrl),
        vscode.commands.registerCommand('journal.memo', () =>
            new ShowEntryForInputCommand(ctrl).execute()),
        ShowEntryForTodayCommand.create(ctrl),
        ShowEntryForTomorrowCommand.create(ctrl),
        ShowEntryForYesterdayCommand.create(ctrl),
        ShowNoteCommand.create(ctrl),
        ShiftTaskCommand.create(ctrl),
        OpenPreviousEntryCommand.create(ctrl),
        OpenNextEntryCommand.create(ctrl),
    );
}

/** Registers the markdown code-action providers (task state transitions). */
export function registerCodeActions(ctrl: Container, context: vscode.ExtensionContext): void {
    // TODO: add filters only for configured base directories
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(MARKDOWN_SELECTOR, new CompletedTaskActions(ctrl)),
        vscode.languages.registerCodeActionsProvider(MARKDOWN_SELECTOR, new OpenTaskActions(ctrl)),
    );
}

/** Wires the entry-scan cache invalidation listeners. */
export function registerCacheInvalidation(ctrl: Container, context: vscode.ExtensionContext): void {
    try {
        const scanner = ctrl.ui.getScanner();
        context.subscriptions.push(...scanner.registerInvalidationListeners());
    } catch (error) {
        ctrl.logger.error("Failed to register cache invalidation listeners, reason: ", error);
    }
}
