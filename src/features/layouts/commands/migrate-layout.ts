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
import { LayoutDefinition } from 'journal-core';
import { JournalController } from '../../../shared/model/index';
import { Conflict, migrate, Move, MoveKind, planMigration } from '../migration';

interface KindItem extends vscode.QuickPickItem {
    moveKind: MoveKind;
}

/**
 * Journal: Migrate to Current Layout (#309). Moves the files of the earlier
 * layouts (`journal.patternHistory` and the default patterns) to where the
 * current `journal.patterns` put them and updates the links in the journal.
 * Shows what it would do first, never overwrites a file, and offers to remove
 * an earlier layout from `journal.patternHistory` once it has no files left.
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
            await this.showPreview(moves, conflicts);
            if (moves.length === 0) {
                vscode.window.showInformationMessage(vscode.l10n.t("Nothing to move: the targets of these files exist already, see the preview."));
                return;
            }

            if (this.hasUnsavedJournalFiles()) {
                vscode.window.showWarningMessage(vscode.l10n.t("Save your journal files first, then run the migration again."));
                return;
            }
            const move = vscode.l10n.t("Move");
            const answer = await vscode.window.showWarningMessage(
                vscode.l10n.t("Move {0} files to the current layout and update the links in the journal?", moves.length),
                { modal: true, detail: conflicts.length > 0 ? vscode.l10n.t("{0} files stay where they are, their target exists (see the preview).", conflicts.length) : undefined },
                move);
            if (answer !== move) { return; }

            const result = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Moving journal files…") },
                () => migrate(this.ctrl.fs, this.ctrl.config, moves));
            for (const { move: failed, error } of result.failed) {
                this.ctrl.logger.error("Failed to move ", failed.from, " to ", failed.to, "Reason: ", error);
            }
            const summary = vscode.l10n.t("Moved {0} files, updated the links in {1} files.", result.moved.length, result.linksUpdated.length);
            if (result.failed.length > 0) {
                this.ctrl.ui.showError(`${summary} ${vscode.l10n.t("{0} files could not be moved.", result.failed.length)}`);
            } else {
                vscode.window.showInformationMessage(summary);
            }
            await this.offerToRemoveEmptyLayouts();
        } catch (error) {
            this.ctrl.logger.error("Failed to execute command: ", this.command, "Reason: ", error);
            this.ctrl.ui.showError("Failed to migrate the journal layout.");
        }
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

    /** The moves and conflicts as a markdown table in an untitled editor. */
    private async showPreview(moves: Move[], conflicts: Conflict[]): Promise<void> {
        const relative = (file: string, move: Move) => Path.relative(this.ctrl.config.getBasePath(move.scope), file).split(Path.sep).join('/');
        const lines = [`# ${vscode.l10n.t("Journal layout migration (preview)")}`, ''];
        lines.push(`## ${vscode.l10n.t("To move ({0})", moves.length)}`, '', `| ${vscode.l10n.t("From")} | ${vscode.l10n.t("To")} | ${vscode.l10n.t("Scope")} |`, '|---|---|---|');
        lines.push(...moves.map(move => `| ${relative(move.from, move)} | ${relative(move.to, move)} | ${move.scope} |`));
        if (conflicts.length > 0) {
            lines.push('', `## ${vscode.l10n.t("Stay where they are ({0})", conflicts.length)}`, '',
                vscode.l10n.t("The target exists already (or another file goes there). Merge them by hand."), '',
                `| ${vscode.l10n.t("File")} | ${vscode.l10n.t("Target")} | ${vscode.l10n.t("Scope")} |`, '|---|---|---|');
            lines.push(...conflicts.map(conflict => `| ${relative(conflict.from, conflict)} | ${relative(conflict.to, conflict)} | ${conflict.scope} |`));
        }
        const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') + '\n' });
        await vscode.window.showTextDocument(doc, { preview: true });
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
        const inUse = new Set([...left.moves, ...left.conflicts].filter(move => move.scope === 'default').map(move => move.layout.history));
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
