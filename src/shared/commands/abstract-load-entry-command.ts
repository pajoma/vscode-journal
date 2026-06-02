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
import { JournalController, Input } from '../model/index';
import { NoteInput, SelectedInput, ScopedTemplate } from '../model/index';
import { isRemoteSession, toLocalFileUri } from '../paths';

/**
 * Base command for "open a journal page for a resolved input". Handles the
 * local-vs-remote prompt and entry/week/selected-input loading. Note inputs
 * are dispatched by the orchestrating command (see ShowEntryForInputCommand),
 * so this base depends only on `shared/` — never on a feature.
 */
export class AbstractLoadEntryForDateCommand implements vscode.Disposable {

    constructor(public ctrl: JournalController) { }

    public async dispose(): Promise<void> {
        // do nothing
    }

    /**
     * Implements commands "yesterday", "today", "yesterday", where the input is predefined (no input box appears)
     * @param input
     */
    public async execute(input: Input): Promise<void> {
        try {
            if (await this.promptLocalOrRemoteInRemoteSession(input)) {
                return;
            }

            const doc = await this.loadPageForInput(input);
            await this.ctrl.ui.showDocument(doc);
        } catch (error) {
            if (!(error instanceof Error && error.message === 'cancel')) {
                this.ctrl.logger.error("Failed to load entry for input: ", input.text, "Reason: ", error);
                this.ctrl.ui.showError("Failed to open entry.");
            } else { return; }
        }
    }

    private async promptLocalOrRemoteInRemoteSession(input: Input): Promise<boolean> {
        if (!isRemoteSession()) {
            return false;
        }

        const openLocal = "Open local journal";
        const forceRemote = "Open journal in remote session";
        const choice = await vscode.window.showWarningMessage(
            "You are in a remote session. Choose where to open the journal.",
            { modal: true },
            openLocal,
            forceRemote
        );

        if (choice === openLocal) {
            await this.openLocalJournal(input);
            return true;
        }

        if (choice !== forceRemote) {
            return true;
        }

        return false;
    }

    private async openLocalJournal(input: Input): Promise<void> {
        const localBase = this.ctrl.config.getBasePathForLocalOpen();
        let targetPath = localBase;

        try {
            // Try to resolve the specific file path for local open
            if (!(input instanceof NoteInput) && !(input instanceof SelectedInput)) {
                if (input.hasWeek()) {
                    const tpl: ScopedTemplate = await this.ctrl.config.getWeekPathPatternForLocalOpen(input.week);
                    const fileTpl: ScopedTemplate = await this.ctrl.config.getWeekFilePattern(input.week);
                    targetPath = tpl.value + "/" + fileTpl.value;
                } else {
                    const date = input.generateDate();
                    const tpl: ScopedTemplate = await this.ctrl.config.getResolvedEntryPathForLocalOpen(date);
                    const fileTpl: ScopedTemplate = await this.ctrl.config.getEntryFilePattern(date);
                    targetPath = tpl.value + "/" + fileTpl.value;
                }
            }
        } catch (error) {
            this.ctrl.logger.error("Failed to resolve local entry path, falling back to base path. Reason: ", error);
        }

        const localOpenUri = toLocalFileUri(targetPath);

        this.ctrl.logger.debug('Opening local journal path via external URI:', localOpenUri.toString());
        const success = await vscode.env.openExternal(localOpenUri);
        if (!success) {
            this.ctrl.logger.error('openExternal returned false for local journal URI:', localOpenUri.toString());
            throw new Error(`Failed to open local journal path: ${targetPath}`);
        }
    }

    /**
     * Expects any (non-note) input from the magic input and either opens the file or creates it.
     * Note inputs are handled by the orchestrating command before delegating here.
     * @param input
     */
    protected async loadPageForInput(input: Input): Promise<vscode.TextDocument> {
        if (input instanceof SelectedInput) {
            // we just load the path
            return this.ctrl.ui.openDocument((<SelectedInput>input).path);
        } else {
            return this.ctrl.reader.loadEntryForInput(input)
                .then((doc: vscode.TextDocument) => this.ctrl.inject.injectInput(doc, input))
                .then((doc: vscode.TextDocument) => {
                    // Notify other features (e.g. weekly daily-link sync) without importing them.
                    this.ctrl.events.fireEntryOpened({ doc });
                    return doc;
                });
        }
    }
}
