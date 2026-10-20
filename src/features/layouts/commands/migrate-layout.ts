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
import * as Path from 'path';
import { LayoutDefinition, SCOPE_DEFAULT } from 'journal-core';
import { JournalController } from '../../../shared/model/index';
import { migrate, Move, MoveKind, planLinkChanges, planMigration } from '../migration';
import { MigrationPanel } from '../ui/migration-panel';
import { MigrationView } from '../ui/migration-view';

interface KindItem extends vscode.QuickPickItem {
    moveKind: MoveKind;
}

/**
 * Journal: Migrate to Current Layout (#309). Moves the files of the earlier
 * layouts (`journal.patternHistory` and the default patterns) to where the
 * current `journal.patterns` put them and updates the links in the journal.
 * Shows a dry run first (a webview with every move, link change and
 * conflict); files move only when the user presses Move there. Never
 * overwrites a file, and offers to remove an earlier layout from
 * `journal.patternHistory` once it has no files left.
 */
export class MigrateLayoutCommand implements vscode.Command, vscode.Disposable {
    title: string = 'Migrate to Current Layout';
    command: string = 'journal.migrateLayout';

    protected constructor(public ctrl: JournalController) { }

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: JournalController): vscode.Disposable {
        const cmd = new this(ctrl);
        vscode.commands.registerCommand(cmd.command, () => cmd.execute());
        return cmd;
    }

    /** The open dry run (for tests). */
    public panel?: MigrationPanel;

    public async execute(): Promise<void> {
        this.ctrl.logger.trace("Executing command: ", this.command);
        try {
            const plan = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Looking for files in earlier layouts…") },
                () => planMigration(this.ctrl.fs, this.ctrl.config));
            if (plan.moves.length === 0 && plan.conflicts.length === 0) {
                vscode.window.showInformationMessage(vscode.l10n.t("Nothing to migrate: all journal files are in the current layout."));
                return;
            }

            const kinds = await this.chooseKinds([...plan.moves, ...plan.conflicts]);
            if (!kinds) { return; }
            const moves = plan.moves.filter(move => kinds.has(move.kind));
            const conflicts = plan.conflicts.filter(conflict => kinds.has(conflict.kind));
            const links = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Computing the link changes…") },
                () => planLinkChanges(this.ctrl.fs, this.ctrl.config, moves));

            this.panel = MigrationPanel.show({
                moves: moves.map(move => ({ kind: move.kind, from: this.relative(move.from, move), to: this.relative(move.to, move), scope: move.scope })),
                conflicts: conflicts.map(c => ({ kind: c.kind, from: this.relative(c.from, c), to: this.relative(c.to, c), scope: c.scope, reason: c.reason })),
                links: links.map(change => ({ file: this.relative(change.target), links: change.links })),
                state: 'preview',
            }, () => this.run(moves));
        } catch (error) {
            this.ctrl.logger.error("Failed to execute command: ", this.command, "Reason: ", error);
            this.ctrl.ui.showError("Failed to migrate the journal layout.");
        }
    }

    /** Moves the files (the user pressed Move in the dry run); undefined if it did not start. */
    private async run(moves: Move[]): Promise<MigrationView['result'] | undefined> {
        if (this.hasUnsavedJournalFiles()) {
            vscode.window.showWarningMessage(vscode.l10n.t("Save your journal files first, then press Move again."));
            return undefined;
        }
        try {
            const result = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Moving journal files…") },
                () => migrate(this.ctrl.fs, this.ctrl.config, moves));
            for (const { move, error } of result.failed) {
                this.ctrl.logger.error("Failed to move ", move.from, " to ", move.to, "Reason: ", error);
            }
            void this.offerToRemoveEmptyLayouts().catch(error => this.ctrl.logger.error("Failed to update journal.patternHistory.", error));
            return {
                moved: result.moved.length,
                linkFiles: result.linkChanges.length,
                failed: result.failed.map(({ move, error }) => ({ from: this.relative(move.from, move), error: String(error) })),
            };
        } catch (error) {
            this.ctrl.logger.error("Failed to migrate the journal layout. Reason: ", error);
            this.ctrl.ui.showError("Failed to migrate the journal layout.");
            return undefined;
        }
    }

    /** A path relative to the base of the move's scope (or of the scope it lies in), with "/". */
    private relative(file: string, move?: Move): string {
        const scopes = move ? [move.scope] : this.ctrl.config.getScopeList().map(scope => scope.name);
        const bases = scopes.map(scope => this.ctrl.config.getBasePath(scope)).sort((a, b) => b.length - a.length);
        const base = bases.find(b => Path.normalize(file).startsWith(Path.normalize(b) + Path.sep));
        return (base ? Path.relative(base, file) : file).split(Path.sep).join('/');
    }

    /** Which kinds of files to move: entries and weekly entries by default, notes on request. Undefined if cancelled. */
    private async chooseKinds(files: Move[]): Promise<Set<MoveKind> | undefined> {
        const count = (kind: MoveKind) => files.filter(file => file.kind === kind).length;
        const items: KindItem[] = ([
            { moveKind: 'entry' as const, label: vscode.l10n.t("Daily entries"), picked: true },
            { moveKind: 'weekly' as const, label: vscode.l10n.t("Weekly entries"), picked: true },
            { moveKind: 'note' as const, label: vscode.l10n.t("Notes"), detail: vscode.l10n.t("Only notes named by the notes pattern; other files in the notes folders stay."), picked: false },
        ] as KindItem[]).filter(item => count(item.moveKind) > 0)
            .map(item => ({ ...item, description: vscode.l10n.t("{0} files", count(item.moveKind)) }));
        const chosen = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            title: vscode.l10n.t("Migrate to Current Layout"),
            placeHolder: vscode.l10n.t("Files of earlier layouts to move to the current journal.patterns"),
        });
        return chosen && chosen.length > 0 ? new Set(chosen.map(item => item.moveKind)) : undefined;
    }

    /** Whether an editor has unsaved changes of a file below a journal base. */
    private hasUnsavedJournalFiles(): boolean {
        const bases = this.ctrl.config.getScopeList().map(scope => Path.normalize(this.ctrl.config.getBasePath(scope.isDefault ? undefined : scope.name)));
        return vscode.workspace.textDocuments.some(doc => doc.isDirty && doc.uri.scheme === 'file'
            && bases.some(base => Path.normalize(doc.uri.fsPath).startsWith(base + Path.sep)));
    }

    /** Offers to remove the layouts of `journal.patternHistory` that have no files left. */
    private async offerToRemoveEmptyLayouts(): Promise<void> {
        const left = await planMigration(this.ctrl.fs, this.ctrl.config);
        const inUse = new Set([...left.moves, ...left.conflicts].filter(move => move.scope === SCOPE_DEFAULT).map(move => move.layout.history));
        const empty = this.ctrl.config.getLayouts()
            .filter(layout => layout.history !== undefined && !inUse.has(layout.history))
            .map(layout => layout.history!);
        if (empty.length === 0) { return; }

        const remove = vscode.l10n.t("Remove");
        const answer = await vscode.window.showInformationMessage(
            vscode.l10n.t("{0} earlier layouts in journal.patternHistory have no files left. Remove them from the setting?", empty.length), remove);
        if (answer !== remove) { return; }

        const settings = vscode.workspace.getConfiguration('journal');
        const defined = settings.inspect<LayoutDefinition[]>('patternHistory');
        const target = defined?.workspaceFolderValue !== undefined ? vscode.ConfigurationTarget.WorkspaceFolder
            : defined?.workspaceValue !== undefined ? vscode.ConfigurationTarget.Workspace
                : vscode.ConfigurationTarget.Global;
        const history = settings.get<LayoutDefinition[]>('patternHistory', []);
        await settings.update('patternHistory', history.filter((_layout, i) => !empty.includes(i)), target);
    }
}
