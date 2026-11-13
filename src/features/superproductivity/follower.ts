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
import { JournalController, TasksChangedEvent } from '../../shared/model/index';
import { SuperProductivityClient, SuperProductivitySettings } from './client';
import { failureMessage } from './host';
import { MappingFile } from './mapping';

type FollowerDeps = Pick<JournalController, 'events' | 'logger' | 'ui'>;

/**
 * Does in Super Productivity what the code actions did in the journal
 * (`TasksChangedEvent`): completes, reopens or plans for a day the linked
 * tasks of the keys. Does nothing while the integration is off.
 */
export class SuperProductivityFollower implements vscode.Disposable {
    private readonly subscription: vscode.Disposable;

    constructor(private readonly ctrl: FollowerDeps, private readonly client: SuperProductivityClient, private readonly settings: () => SuperProductivitySettings, private readonly file: MappingFile) {
        this.subscription = ctrl.events.onTasksChanged(event => { void this.follow(event); });
    }

    public async follow({ keys, change }: TasksChangedEvent): Promise<void> {
        if (!this.settings().enabled) { return; }
        try {
            const mapping = await this.file.load();
            const ids = keys.flatMap(key => mapping.get(key) ?? []);
            if (ids.length === 0) { return; }
            const tasks = await Promise.all(ids.map(id => change === 'done' || change === 'reopened'
                ? this.client.setTaskState(id, change === 'done')
                : this.client.setDueDay(id, change.day)));
            if (tasks.includes(undefined)) {
                vscode.window.showWarningMessage(vscode.l10n.t("The linked task does not exist in Super Productivity any more."));
            }
        } catch (error) {
            this.ctrl.logger.error("Failed to follow the change of tasks in Super Productivity.", error);
            this.ctrl.ui.showError(failureMessage(error));
        }
    }

    public dispose(): void {
        this.subscription.dispose();
    }
}
