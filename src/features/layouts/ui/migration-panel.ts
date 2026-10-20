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
import { createNonce } from '../../../shared/webview/html';
import { MigrationMessage, MigrationView, renderMigration } from './migration-view';

/**
 * The webview of Journal: Migrate to Current Layout (#309): shows the dry run
 * and runs the move when the user presses Move; closing it moves nothing.
 */
export class MigrationPanel {

    public static readonly viewType = 'journal.migrateLayout';

    private constructor(
        private readonly panel: vscode.WebviewPanel,
        private view: MigrationView,
        /** Moves the files; undefined if it did not start (e.g. unsaved journal files). */
        private readonly move: () => Promise<MigrationView['result'] | undefined>,
    ) {
        panel.webview.onDidReceiveMessage((message: MigrationMessage) => this.handle(message));
        this.render();
    }

    public static show(view: MigrationView, move: () => Promise<MigrationView['result'] | undefined>): MigrationPanel {
        const panel = vscode.window.createWebviewPanel(MigrationPanel.viewType, vscode.l10n.t("Migrate to Current Layout"), vscode.ViewColumn.Active,
            { enableScripts: true, localResourceRoots: [] });
        return new MigrationPanel(panel, view, move);
    }

    /** The rendered page (for tests). */
    public get html(): string {
        return this.panel.webview.html;
    }

    public async handle(message: MigrationMessage): Promise<void> {
        if (message.type === 'close') {
            this.panel.dispose();
            return;
        }
        if (message.type !== 'move' || this.view.state !== 'preview') { return; }
        this.update({ state: 'running' });
        try {
            const result = await this.move();
            this.update(result ? { state: 'done', result } : { state: 'preview' });
        } catch (error) {
            this.update({ state: 'preview' });
            throw error;
        }
    }

    private update(change: Partial<MigrationView>): void {
        this.view = { ...this.view, ...change };
        this.render();
    }

    private render(): void {
        this.panel.webview.html = renderMigration(this.view, { cspSource: this.panel.webview.cspSource, nonce: createNonce() }, vscode.l10n.t);
    }
}
