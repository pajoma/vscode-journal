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
import { JournalController } from '../../shared/model/index';
import { changedLayouts, currentLayouts } from './layout-changes';

/** The settings editor writes on every keystroke: the layout is compared once the edits have settled. */
const SETTLE_MS = 1500;

/**
 * Warns when the settings change the journal layout (`journal.patterns`,
 * `journal.ext` or the patterns of a scope, #309): the files written before
 * stay where they are. The modal dialog points to Journal: Migrate to Current
 * Layout and to `journal.patternHistory`. Changes made while VS Code was
 * closed are not noticed.
 */
export class LayoutWatcher implements vscode.Disposable {

    private known: Map<string, string>;
    private timer?: ReturnType<typeof setTimeout>;
    private readonly listener: vscode.Disposable;

    constructor(private readonly ctrl: JournalController) {
        this.known = currentLayouts(ctrl.config);
        this.listener = vscode.workspace.onDidChangeConfiguration(event => {
            if (!['journal.patterns', 'journal.ext', 'journal.scopes'].some(section => event.affectsConfiguration(section))) { return; }
            clearTimeout(this.timer);
            this.timer = setTimeout(() => {
                this.check().catch(error => this.ctrl.logger.error("Failed to check the journal layout.", error));
            }, SETTLE_MS);
        });
    }

    /** Compares the layouts with the last known ones and warns if they changed. */
    public async check(): Promise<void> {
        const now = currentLayouts(this.ctrl.config);
        const changed = changedLayouts(this.known, now);
        this.known = now;
        if (changed.length === 0) { return; }

        const scopes = changed.filter(scope => scope !== 'default').map(scope => `#${scope}`);
        const migrate = vscode.l10n.t("Migrate to Current Layout");
        const answer = await vscode.window.showWarningMessage(
            scopes.length === 0
                ? vscode.l10n.t("The journal layout has changed.")
                : vscode.l10n.t("The journal layout has changed (scopes {0}).", scopes.join(', ')),
            {
                modal: true,
                detail: vscode.l10n.t("Entries, weekly entries and notes written before stay where they are; new ones go to the new layout. Run Journal: Migrate to Current Layout to move the old files: it shows a dry run first and changes nothing until you confirm. If the old patterns were not the defaults, add them to journal.patternHistory first, so the journal and the migration find those files."),
            },
            migrate);
        if (answer === migrate) {
            await vscode.commands.executeCommand('journal.migrateLayout');
        }
    }

    public dispose(): void {
        clearTimeout(this.timer);
        this.listener.dispose();
    }
}
