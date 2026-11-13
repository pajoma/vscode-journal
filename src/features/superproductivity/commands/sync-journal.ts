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
import { JournalIndex } from '../../../shared/journal/journal-index';
import { SuperProductivityClient, SuperProductivitySettings } from '../client';
import { failureMessage } from '../host';
import { MappingFile } from '../mapping';
import { projectMoves } from '../projects';
import { projectMap, replaceLines, Session, SessionDeps } from '../session';
import { betaLinks, planSync } from '../sync';
import { applyInSuperProductivity, NO_CHANGES, SyncCounts, syncMessage } from './sync-tasks';

/**
 * Syncs the linked tasks of all entries and plans of the journal, open or not
 * (docs/specs/2026-11-13-scopes-keys-plans.md): their state, the day they are
 * planned for, the project of those still in the inbox; links of the beta
 * become keys. Sends and imports nothing; that is up to the sync of a page.
 * Changed files are saved, unless they had unsaved changes before.
 */
export class SyncJournalCommand implements vscode.Command, vscode.Disposable {
    title: string = 'Sync All Entries with Super Productivity';
    command: string = 'journal.syncSuperProductivityJournal';

    protected constructor(public ctrl: SessionDeps, private readonly client: SuperProductivityClient, private readonly settings: () => SuperProductivitySettings, private readonly index: JournalIndex, private readonly file: MappingFile) { }

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: SessionDeps, client: SuperProductivityClient, settings: () => SuperProductivitySettings, index: JournalIndex, file: MappingFile): vscode.Disposable {
        const cmd = new this(ctrl, client, settings, index, file);
        vscode.commands.registerCommand(cmd.command, () => cmd.execute());
        return cmd;
    }

    public async execute(): Promise<SyncCounts | undefined> {
        this.ctrl.logger.trace("Executing command: ", this.command);
        if (!this.settings().enabled) {
            vscode.window.showInformationMessage(vscode.l10n.t("The integration with Super Productivity is turned off (journal.superProductivity.enabled)."));
            return undefined;
        }

        const session = await Session.open(this.ctrl, this.index, this.file);
        try {
            return await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Syncing the journal with Super Productivity") }, async () => {
                const counts = { ...NO_CHANGES };
                const save = new Map<string, vscode.TextDocument>();
                const open = async (path: string) => {
                    const document = await vscode.workspace.openTextDocument(path);
                    if (!document.isDirty) { save.set(path, document); }
                    return document;
                };

                // 1. links of the beta become keys
                let { entries, plans } = await session.journal();
                const withBeta = [...entries, ...plans].filter(page => betaLinks(page.lines).length);
                if (withBeta.length) {
                    const edit = new vscode.WorkspaceEdit();
                    for (const page of withBeta) {
                        const { edits, converted } = await session.keyLines(page.lines, [], 'scope' in page ? page.scope as string : undefined);
                        replaceLines(edit, await open(page.path), page.lines, edits);
                        counts.converted += converted;
                    }
                    await vscode.workspace.applyEdit(edit);
                    ({ entries, plans } = await session.journal());
                }

                // 2. the state of the linked tasks of every page
                const { plannedDay } = await session.journal();
                const tasks = new Map((await this.client.listTasks()).map(task => [task.id, task]));
                const projects = await projectMap(this.client, this.settings());
                const pages = [...entries.map(page => ({ ...page, scope: undefined as string | undefined })), ...plans];
                const synced = pages.map(page => ({ page, plan: planSync(page.lines, tasks, session.mapping, session.scopeName, plannedDay) }));
                const moves = pages.flatMap(page => projectMoves(page.lines, tasks, session.mapping, projects, session.scopeName, page.scope));
                Object.assign(counts, await applyInSuperProductivity(this.client, synced.map(s => s.plan), moves));

                const edit = new vscode.WorkspaceEdit();
                for (const { page, plan } of synced) {
                    counts.missing += plan.missing;
                    if (plan.edits.length === 0) { continue; }
                    replaceLines(edit, await open(page.path), page.lines, plan.edits.map(e => [e.line, e.text]));
                    counts.completedInJournal += plan.completedInJournal;
                    counts.reopenedInJournal += plan.reopenedInJournal;
                }
                await vscode.workspace.applyEdit(edit);
                await Promise.all([...save.values()].filter(document => document.isDirty).map(document => document.save()));

                vscode.window.showInformationMessage(syncMessage(counts));
                return counts;
            });
        } catch (error) {
            this.ctrl.logger.error("Failed to execute command: ", this.command, "Reason: ", error);
            this.ctrl.ui.showError(failureMessage(error));
            return undefined;
        } finally {
            await session.save();
        }
    }
}
