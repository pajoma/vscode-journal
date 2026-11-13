// Copyright (C) 2026 Patrick Maué
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
import { ScopeDefinition, scopeRefs, SCOPE_DEFAULT, SLUG } from 'journal-core';
import { JournalController } from '../../../shared/model/index';
import { refreshScopeFolders } from '../scope-folders';

/** A slug as typed, without a leading `+` or `#`. */
const clean = (slug: string) => slug.trim().replace(/^[+#]/, '');

/**
 * Creates a scope (docs/specs/2026-11-13-scopes-keys-plans.md): asks for its
 * slug, then for its folder inside the journal (default `<scopeRoot>/<slug>`)
 * and creates the folder. A folder that is not directly below the scope root
 * is written to `journal.scopes`, so the scope is found. Notes created with
 * `+slug Title` are then stored in the folder, tasks with `+slug` get its keys.
 */
export class CreateScopeCommand implements vscode.Command, vscode.Disposable {
    title: string = 'Create a new scope';
    command: string = 'journal.createScope';

    protected constructor(public ctrl: JournalController) { }

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: JournalController): vscode.Disposable {
        const cmd = new this(ctrl);
        vscode.commands.registerCommand(cmd.command, (slug?: string, folder?: string) => cmd.execute(slug, folder));
        return cmd;
    }

    /** Returns an error message for an invalid or existing slug, undefined if the slug is fine. */
    public validate(slug: string): string | undefined {
        const name = clean(slug);
        if (!SLUG.test(name) || name === SCOPE_DEFAULT) {
            return vscode.l10n.t("Use lowercase letters, digits and '-', starting with a letter.");
        }
        if (this.ctrl.config.getScopes().some(scope => scope.toLowerCase() === name)) {
            return vscode.l10n.t("The scope +{0} already exists.", name);
        }
        return undefined;
    }

    /**
     * Returns an error message for a folder the scope cannot have, undefined
     * if it is fine: it must be inside the journal, and below the scope root
     * only as `<scopeRoot>/<slug>` (every folder there is a scope).
     */
    public validateFolder(slug: string, folder: string): string | undefined {
        const path = Path.normalize(folder.trim());
        const base = Path.normalize(this.ctrl.config.getBasePath());
        const root = Path.normalize(this.ctrl.config.getScopeRoot());
        if (!Path.isAbsolute(path) || !path.startsWith(base + Path.sep)) {
            return vscode.l10n.t("The folder must be inside the journal ({0}).", base);
        }
        if (path.startsWith(root + Path.sep) && Path.relative(root, path) !== clean(slug)) {
            return vscode.l10n.t("Below {0}, every folder is a scope: use {1}, or a folder outside of it.", root, Path.join(root, clean(slug)));
        }
        return undefined;
    }

    /**
     * @param slug the slug of the scope (asks for it if omitted)
     * @param folder its folder (asked for if the slug was asked for, else `<scopeRoot>/<slug>`)
     * @returns the path of the new scope folder, undefined if cancelled or invalid
     */
    public async execute(slug?: string, folder?: string): Promise<string | undefined> {
        this.ctrl.logger.trace("Executing command: ", this.command);
        try {
            const asked = slug === undefined;
            const input = slug ?? await vscode.window.showInputBox({
                prompt: vscode.l10n.t("Slug of the new scope: +slug stores notes there and keys its tasks (e.g. +acme)"),
                placeHolder: "acme",
                validateInput: value => this.validate(value),
            });
            if (input === undefined) { return undefined; }
            const error = this.validate(input);
            if (error) {
                await vscode.window.showWarningMessage(error);
                return undefined;
            }
            const name = clean(input);

            const proposed = Path.join(this.ctrl.config.getScopeRoot(), name);
            const target = folder ?? (asked ? await vscode.window.showInputBox({
                prompt: vscode.l10n.t("Folder of the scope +{0}, inside the journal", name),
                value: proposed,
                validateInput: value => this.validateFolder(name, value),
            }) : proposed);
            if (target === undefined) { return undefined; }
            const folderError = this.validateFolder(name, target);
            if (folderError) {
                await vscode.window.showWarningMessage(folderError);
                return undefined;
            }
            const path = Path.normalize(target.trim());

            await this.ctrl.fs.createDirectory(path);
            // git does not track empty folders
            await this.ctrl.fs.writeFile(Path.join(path, '.gitkeep'), new Uint8Array());
            if (Path.dirname(path) !== Path.normalize(this.ctrl.config.getScopeRoot())) {
                const relative = Path.relative(this.ctrl.config.getBasePath(), path).split(Path.sep).join('/');
                await this.addSetting({ name, base: '${base}/' + relative });
            }
            await refreshScopeFolders(this.ctrl);

            const used = await this.uses(name);
            vscode.window.showInformationMessage(used > 0
                ? vscode.l10n.t("Scope +{0} created. {1} lines of the journal already name +{0}: they belong to the scope now.", name, used)
                : vscode.l10n.t("Scope +{0} created. Start a note title or a task with +{0}.", name));
            return path;
        } catch (error) {
            this.ctrl.logger.error("Failed to execute command: ", this.command, "Reason: ", error);
            this.ctrl.ui.showError("Failed to create scope.");
            return undefined;
        }
    }

    /** Adds the scope to `journal.scopes`, where the setting is defined (user settings by default). */
    protected async addSetting(entry: ScopeDefinition): Promise<void> {
        const settings = vscode.workspace.getConfiguration('journal');
        const defined = settings.inspect<ScopeDefinition[]>('scopes');
        const target = defined?.workspaceFolderValue !== undefined ? vscode.ConfigurationTarget.WorkspaceFolder
            : defined?.workspaceValue !== undefined ? vscode.ConfigurationTarget.Workspace
                : vscode.ConfigurationTarget.Global;
        const scopes = settings.get<ScopeDefinition[]>('scopes', []);
        await settings.update('scopes', [...(Array.isArray(scopes) ? scopes : []), entry], target);
    }

    /** How many lines of the journal name `+name` already. */
    private async uses(name: string): Promise<number> {
        const texts = await this.ctrl.keys.texts();
        return texts.flatMap(text => text.split(/\r?\n/))
            .filter(line => scopeRefs(line).some(ref => ref.name.toLowerCase() === name)).length;
    }
}
