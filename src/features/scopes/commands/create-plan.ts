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
import { TEMPLATE_FALLBACKS } from 'journal-core';
import { fileExists } from '../../../shared/fs/fs-exists';
import { JournalController } from '../../../shared/model/index';

export const CREATE_PLAN = 'journal.createPlan';

/**
 * Starts the plan of a scope: `Plan.md` in its folder, from the template
 * `plan` (`${input}` is the slug), and opens it; an existing plan is opened.
 */
export class CreatePlanCommand implements vscode.Command, vscode.Disposable {
    title: string = 'Create Plan';
    command: string = CREATE_PLAN;

    protected constructor(public ctrl: Pick<JournalController, 'config' | 'fs' | 'logger' | 'ui'>) { }

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: Pick<JournalController, 'config' | 'fs' | 'logger' | 'ui'>): vscode.Disposable {
        const cmd = new this(ctrl);
        vscode.commands.registerCommand(cmd.command, (slug?: string) => cmd.execute(slug));
        return cmd;
    }

    /** @param slug the scope; asked for if omitted (command palette). @returns the plan's path, undefined if cancelled */
    public async execute(slug?: string): Promise<string | undefined> {
        this.ctrl.logger.trace("Executing command: ", this.command, slug);
        try {
            const name = typeof slug === 'string' ? slug : (await vscode.window.showQuickPick(this.ctrl.config.getScopes().slice(1).map(scope => `#${scope}`), {
                placeHolder: vscode.l10n.t("Scope of the plan"),
            }))?.slice(1);
            if (!name) { return undefined; }
            const scope = this.ctrl.config.getScope(name);
            if (scope.isDefault || !scope.notesFolder) {
                vscode.window.showInformationMessage(vscode.l10n.t("No scope named {0}.", name));
                return undefined;
            }
            const path = Path.join(scope.notesFolder, `Plan.${this.ctrl.config.getFileExtension()}`);
            const created = !(await fileExists(this.ctrl.fs, path));
            if (created) {
                const template = this.ctrl.config.getInlineTemplate('plan', TEMPLATE_FALLBACKS.plan, scope.name).template;
                await this.ctrl.fs.writeFile(path, Buffer.from(template.split('${input}').join(scope.name)));
            }
            const editor = await vscode.window.showTextDocument(vscode.Uri.file(path));
            if (created) {
                // ready to write the first item: the cursor at the end of the template's last task
                const lines = editor.document.getText().split(/\r?\n/);
                const last = lines.map((text, i) => ({ text, i })).filter(({ text }) => /^\s*[-*+] \[ \]/.test(text)).pop();
                if (last) {
                    const end = new vscode.Position(last.i, last.text.length);
                    editor.selection = new vscode.Selection(end, end);
                }
            }
            return path;
        } catch (error) {
            this.ctrl.logger.error("Failed to execute command: ", this.command, "Reason: ", error);
            this.ctrl.ui.showError(vscode.l10n.t("Failed to create the plan."));
            return undefined;
        }
    }
}
