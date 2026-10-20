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
import { parseWikiTarget } from 'journal-core';
import { JournalController } from '../../../shared/model/index';
import { resolveWikiTarget } from '../resolve';
import { JournalIndex } from '../../../shared/journal/journal-index';
import { OPEN_WIKI_LINK } from '../wiki-link-provider';

/**
 * Opens the target of a wiki link (#92), run by Ctrl+click: the entry of a
 * day or week (created if missing, like Today), or a note (created in its
 * scope if no note has that title; a choice if several have it).
 */
export class OpenWikiLinkCommand implements vscode.Disposable {
    command: string = OPEN_WIKI_LINK;

    protected constructor(public ctrl: JournalController, private readonly index: JournalIndex) { }

    public async dispose(): Promise<void> {
        // do nothing
    }

    public static create(ctrl: JournalController, index: JournalIndex): vscode.Disposable {
        const cmd = new this(ctrl, index);
        vscode.commands.registerCommand(cmd.command, (target: string, from?: string) => cmd.execute(target, from));
        return cmd;
    }

    /**
     * @param target the text between `[[` and `]]`
     * @param from the file the link is in
     * @returns the path that was opened, undefined if none
     */
    public async execute(target: string, from?: string): Promise<string | undefined> {
        this.ctrl.logger.trace("Executing command: ", this.command, target);
        try {
            const parsed = parseWikiTarget(target);
            let path: string | undefined;
            if (parsed.kind === 'day') {
                path = await this.ctrl.reader.loadEntryForDay(new Date(parsed.year, parsed.month - 1, parsed.day));
            } else if (parsed.kind === 'week') {
                path = await this.ctrl.reader.loadEntryForWeek(parsed.week, parsed.year);
            } else {
                const resolved = resolveWikiTarget(target, await this.index.get());
                if (resolved.kind === 'found') {
                    path = resolved.path;
                } else if (resolved.kind === 'ambiguous') {
                    path = await this.choose(target, resolved.paths);
                } else if (parsed.folders.length > 0) {
                    vscode.window.showInformationMessage(vscode.l10n.t("No note found for [[{0}]].", target));
                } else if ((await this.ctrl.parser.parseInput(target)).kind === 'entry') {
                    vscode.window.showInformationMessage(vscode.l10n.t("[[{0}]] is a relative date: links in files name the day, e.g. [[2026-10-19]]. Type [[ to get it suggested.", target));
                } else {
                    // a new note, in its scope, like a note created with the smart input
                    const input = this.ctrl.parser.noteInput(parsed.scope ? `#${parsed.scope} ${parsed.title}` : parsed.title);
                    input.path = await this.ctrl.parser.resolveNotePathForInput(input);
                    path = await this.ctrl.notes.open(input);
                }
            }
            if (path) { await this.ctrl.editor.show(path); }
            return path;
        } catch (error) {
            this.ctrl.logger.error("Failed to open the wiki link [[", target, "]] in ", from, "Reason: ", error);
            this.ctrl.ui.showError("Failed to open the link.");
            return undefined;
        }
    }

    /** Several notes have the title: the user picks one. */
    private async choose(target: string, paths: string[]): Promise<string | undefined> {
        const base = this.ctrl.config.getBasePath();
        const picked = await vscode.window.showQuickPick(
            paths.map(path => ({ label: Path.basename(path), description: Path.relative(base, Path.dirname(path)).split(Path.sep).join('/'), path })),
            { placeHolder: vscode.l10n.t("Several notes are named [[{0}]]: write the folders in front to tell them apart", target) });
        return picked?.path;
    }
}
