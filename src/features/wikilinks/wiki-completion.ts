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
import { dayWikiTarget, noteWikiTarget, weekWikiTarget } from 'journal-core';
import { JournalController } from '../../shared/model/index';
import { JournalIndex } from '../../shared/journal/journal-index';
import { inJournal } from './wiki-link-provider';

/**
 * Completion after `[[` (#92): daily entries (newest first), weekly entries
 * and notes, and the day a relative date names (`[[yesterday` → `2026-10-19`):
 * a link in a file names the day, a relative date would change its meaning.
 */
export class WikiCompletionProvider implements vscode.CompletionItemProvider {

    constructor(private readonly ctrl: JournalController, private readonly index: JournalIndex) { }

    async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[] | undefined> {
        if (!inJournal(this.ctrl, document.uri)) { return undefined; }
        const line = document.lineAt(position).text;
        const typed = /\[\[([^[\]|]*)$/.exec(line.slice(0, position.character))?.[1];
        if (typed === undefined) { return undefined; }
        const range = new vscode.Range(position.translate(0, -typed.length), position);
        const close = line.slice(position.character).startsWith(']]') ? '' : ']]';
        const item = (label: string | vscode.CompletionItemLabel, target: string, kind: vscode.CompletionItemKind, sort: string) => {
            const completion = new vscode.CompletionItem(label, kind);
            completion.insertText = target + close;
            completion.range = range;
            completion.sortText = sort;
            return completion;
        };

        const items: vscode.CompletionItem[] = [];
        const relative = await this.relativeTarget(typed);
        if (relative) {
            const completion = item({ label: typed.trim(), description: relative }, relative, vscode.CompletionItemKind.Event, '0');
            completion.filterText = typed;
            completion.preselect = true;
            items.push(completion);
        }

        const files = await this.index.get();
        const base = this.ctrl.config.getBasePath();
        const sortable = (key: string) => String(99999999 - Number(key.replace(/\D/g, '').padEnd(8, '0'))).padStart(8, '0');
        for (const day of files.days.keys()) {
            items.push(item({ label: day, description: vscode.l10n.t("Daily entry") }, day, vscode.CompletionItemKind.Event, '1' + sortable(day)));
        }
        for (const week of files.weeks.keys()) {
            items.push(item({ label: week, description: vscode.l10n.t("Weekly entry") }, week, vscode.CompletionItemKind.Event, '2' + sortable(week)));
        }
        for (const note of files.notes) {
            const target = noteWikiTarget(note, files.notes);
            const folder = Path.relative(base, Path.dirname(note.path)).split(Path.sep).join('/');
            const completion = item({ label: note.title, description: [note.scope === 'default' ? '' : `#${note.scope}`, folder].filter(Boolean).join(' ') },
                target, vscode.CompletionItemKind.File, '3' + note.title.toLowerCase());
            completion.filterText = `${note.title} ${target}`;
            items.push(completion);
        }
        return items;
    }

    /** The absolute target of a relative date or week (`yesterday`, `+1`, `next wednesday`, `w43`); undefined for anything else. */
    private async relativeTarget(typed: string): Promise<string | undefined> {
        if (typed.trim() === '' || /^\d{4}-(\d{2}-\d{2}|w\d{1,2})$/i.test(typed.trim())) { return undefined; }
        try {
            const input = await this.ctrl.parser.parseInput(typed.trim());
            if (input.kind !== 'entry') { return undefined; }
            if (input.hasWeek()) { return weekWikiTarget(input.week, input.weekYear); }
            return input.hasOffset() ? dayWikiTarget(input.generateDate()) : undefined;
        } catch {
            return undefined;
        }
    }
}
