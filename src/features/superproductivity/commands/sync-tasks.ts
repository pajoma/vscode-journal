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

import moment = require('moment');
import * as vscode from 'vscode';
import { formatKey, keyName, keyOf, LINE_KINDS } from 'journal-core';
import { inJournal } from '../../../shared/journal/in-journal';
import { JournalIndex } from '../../../shared/journal/journal-index';
import { JournalController } from '../../../shared/model/index';
import { SuperProductivityClient, SuperProductivitySettings, SuperProductivityTask } from '../client';
import { failureMessage } from '../host';
import { MappingFile } from '../mapping';
import { newTask, ProjectMap, projectMoves } from '../projects';
import { linesOf, PageInfo, projectMap, replaceLines, Session, SessionDeps } from '../session';
import { planSync, SyncPlan, tasksToImport, tasksToSend, taskText } from '../sync';

type SyncTasksDeps = SessionDeps & Pick<JournalController, 'inject'>;

/** What a sync did, for the message. */
export interface SyncCounts {
    sent: number;
    imported: number;
    converted: number;
    completedInJournal: number;
    reopenedInJournal: number;
    completed: number;
    moved: number;
    /** Moved from the inbox to the project of their scope. */
    assigned: number;
    missing: number;
}

export const NO_CHANGES: SyncCounts = { sent: 0, imported: 0, converted: 0, completedInJournal: 0, reopenedInJournal: 0, completed: 0, moved: 0, assigned: 0, missing: 0 };

/**
 * Completes, plans and moves to their project the tasks in Super Productivity
 * the plans ask for, each once; returns how many.
 */
export async function applyInSuperProductivity(client: SuperProductivityClient, plans: SyncPlan[], moves: { id: string; projectId: string }[] = []): Promise<{ completed: number; moved: number; assigned: number }> {
    const complete = new Set(plans.flatMap(plan => plan.complete));
    const reschedule = new Map(plans.flatMap(plan => plan.reschedule).map(({ id, day }) => [id, day]));
    const assign = new Map(moves.map(({ id, projectId }) => [id, projectId]));
    for (const id of complete) { await client.setTaskState(id, true); }
    for (const [id, day] of reschedule) { await client.setDueDay(id, day); }
    for (const [id, projectId] of assign) { await client.setProject(id, projectId); }
    return { completed: complete.size, moved: reschedule.size, assigned: assign.size };
}

export function syncMessage(counts: SyncCounts): string {
    let message = vscode.l10n.t("Super Productivity: {0} sent, {1} imported; {2} completed and {3} reopened in the journal; {4} completed, {5} planned for another day and {6} moved to their project in Super Productivity.",
        counts.sent, counts.imported, counts.completedInJournal, counts.reopenedInJournal, counts.completed, counts.moved, counts.assigned);
    if (counts.converted > 0) { message += " " + vscode.l10n.t("{0} link(s) of the beta turned into keys.", counts.converted); }
    if (counts.missing > 0) { message += " " + vscode.l10n.t("{0} linked task(s) do not exist in Super Productivity any more.", counts.missing); }
    return message;
}

/**
 * Syncs the active journal page with Super Productivity
 * (docs/specs/2026-11-13-scopes-keys-plans.md, decisions 20-24); tasks are
 * linked by their key, the mapping keeps the tasks of the keys:
 * 1. its open tasks that are not linked yet get keys and are created there:
 *    in the project of their scope, the title starting with the key; from a
 *    plan only the items without sub-items, with their place in the plan
 * 2. into a daily entry, the tasks planned there for that day that are
 *    linked nowhere are imported, with a key of the scope of their project
 * 3. the state of its linked tasks is synced, open ones are planned there for
 *    their latest day in the journal, and those still in the inbox go to the
 *    project of their scope
 * Links of the beta (`<!-- sp:… -->`) are turned into keys on the way.
 */
export class SyncTasksCommand implements vscode.Command, vscode.Disposable {
    title: string = 'Sync Tasks with Super Productivity';
    command: string = 'journal.syncSuperProductivity';

    protected constructor(public ctrl: SyncTasksDeps, private readonly client: SuperProductivityClient, private readonly settings: () => SuperProductivitySettings, private readonly index: JournalIndex, private readonly file: MappingFile) { }

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: SyncTasksDeps, client: SuperProductivityClient, settings: () => SuperProductivitySettings, index: JournalIndex, file: MappingFile): vscode.Disposable {
        const cmd = new this(ctrl, client, settings, index, file);
        vscode.commands.registerCommand(cmd.command, () => cmd.execute());
        return cmd;
    }

    public async execute(document = vscode.window.activeTextEditor?.document): Promise<SyncCounts | undefined> {
        this.ctrl.logger.trace("Executing command: ", this.command);
        if (!document) { return undefined; }
        if (!this.settings().enabled) {
            vscode.window.showInformationMessage(vscode.l10n.t("The integration with Super Productivity is turned off (journal.superProductivity.enabled)."));
            return undefined;
        }
        if (!inJournal(this.ctrl, document.uri)) {
            vscode.window.showInformationMessage(vscode.l10n.t("The active document is not part of the journal."));
            return undefined;
        }

        const session = await Session.open(this.ctrl, this.index, this.file);
        try {
            const page = await session.page(document.uri.fsPath);
            const all = await this.client.listTasks();
            const tasks = new Map<string, SuperProductivityTask>(all.map(task => [task.id, task]));
            const projects = await projectMap(this.client, this.settings());
            const counts = { ...NO_CHANGES };

            await this.send(document, page, session, tasks, projects, counts);
            if (page.day) { await this.import(document, page.day, session, all, projects, counts); }

            const { plannedDay } = await session.journal();
            const current = linesOf(document);
            const plan = planSync(current, tasks, session.mapping, session.scopeName, plannedDay);
            Object.assign(counts, await applyInSuperProductivity(this.client, [plan], projectMoves(current, tasks, session.mapping, projects, session.scopeName, page.scope)));
            const edit = new vscode.WorkspaceEdit();
            replaceLines(edit, document, current, plan.edits.map(e => [e.line, e.text]));
            await vscode.workspace.applyEdit(edit);
            Object.assign(counts, { completedInJournal: plan.completedInJournal, reopenedInJournal: plan.reopenedInJournal, missing: plan.missing });

            vscode.window.showInformationMessage(syncMessage(counts));
            return counts;
        } catch (error) {
            this.ctrl.logger.error("Failed to execute command: ", this.command, "Reason: ", error);
            this.ctrl.ui.showError(failureMessage(error));
            return undefined;
        } finally {
            // the tasks created so far stay linked, also after a failure
            await session.save();
        }
    }

    /** Gives the open tasks that are not linked yet their keys, then creates them in Super Productivity. */
    private async send(document: vscode.TextDocument, page: PageInfo, session: Session, tasks: Map<string, SuperProductivityTask>, projects: ProjectMap, counts: SyncCounts): Promise<void> {
        const before = linesOf(document);
        const sending = tasksToSend(before, session.mapping, session.scopeName, page.scope !== undefined);
        const { edits, converted } = await session.keyLines(before, sending, page.scope);
        counts.converted = converted;
        const edit = new vscode.WorkspaceEdit();
        replaceLines(edit, document, before, edits);
        await vscode.workspace.applyEdit(edit);

        const lines = linesOf(document);
        const template = this.ctrl.config.getTaskInlineTemplate().template;
        for (const line of sending) {
            const key = keyOf(lines[line], session.scopeName);
            const name = keyName(lines[line], session.scopeName);
            // a line changed meanwhile, or a link of the beta: nothing to create
            if (!key || !name || session.mapping.get(name)) { continue; }
            const created = newTask(lines, line, key, taskText(lines[line], template), page, projects, session.scopeName);
            const task = await this.client.createTask(created.title, created.where);
            session.mapping.set(name, task.id);
            tasks.set(task.id, task);
            counts.sent++;
        }
    }

    /** Adds the tasks planned for the day that are linked nowhere to the entry, each with a key of the scope of its project. */
    private async import(document: vscode.TextDocument, day: string, session: Session, all: SuperProductivityTask[], projects: ProjectMap, counts: SyncCounts): Promise<void> {
        const imported = tasksToImport(all, day, moment().format('YYYY-MM-DD'), session.mapping.taskIds());
        if (imported.length === 0) { return; }
        const scopes = this.ctrl.config.getScopes().slice(1);
        const lines: string[] = [];
        for (const task of imported) {
            const key = await session.nextKey(projects.scope(task.projectId, scopes));
            session.mapping.set(formatKey(key).toLowerCase(), task.id);
            lines.push(`${formatKey(key)} ${task.title}`);
        }
        await this.ctrl.inject.place(document.uri.fsPath, this.ctrl.config.getTaskInlineTemplate(), LINE_KINDS.task, lines.map(text => ({ values: [["${input}", text]] })));
        counts.imported = imported.length;
    }
}
