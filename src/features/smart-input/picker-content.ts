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
//

'use strict';

import * as vscode from 'vscode';
import * as Path from 'path';
import moment = require('moment');
import { denormalizeFilename, stringIsNotEmpty } from '../../shared/index';
import { SearchHit } from './search-index';
import { FileEntry, EditorSettings, IFileSystem, IParser, Input, JournalPageType, ScopeDirectory } from '../../shared/model/index';
import { entrySummary, EntrySummary, JournalPaths, JournalScopes, JournalSettings } from 'journal-core';
import { sortPickEntries } from './scan-entries';
import { templateSegments } from '../../shared/fs/template-walk';
import { entryTemplate, getJournalDate, getWeekFromPath, matchPathTemplate, notesTemplate } from '../../shared/paths';

/** A row of the smart-input picker. */
export interface PickItem extends vscode.QuickPickItem {
    /** The input this row stands for; resolved on accept. */
    parsedInput?: Input;
    /** The row mirroring what the user types; replaced on every keystroke. */
    replace?: boolean;
    path: string;
    /** Opens the second-level picker for this type. */
    pickItem?: JournalPageType;
    /** Opens the smart search (#300). */
    search?: boolean;
    fileEntry?: FileEntry;
    /** The line of a search hit (0-based). */
    line?: number;
}

/**
 * What the smart-input picker shows: start rows, the row for the typed input,
 * the rows for scanned files and the directories to scan. No QuickPick here;
 * the UI lives in {@link Picker}.
 */
export class PickerContent {

    constructor(
        private readonly config: JournalSettings & JournalScopes & JournalPaths & EditorSettings,
        private readonly parser: IParser,
        private readonly fs: IFileSystem,
    ) { }

    /** The fixed rows of the first-level picker. */
    public startItems(): PickItem[] {
        return [
            { label: vscode.l10n.t("Today"), description: vscode.l10n.t("Jump to today's entry."), pickItem: JournalPageType.entry, parsedInput: new Input(0), alwaysShow: true, path: "" },
            { label: vscode.l10n.t("Tomorrow"), description: vscode.l10n.t("Jump to tomorrow's entry."), pickItem: JournalPageType.entry, parsedInput: new Input(1), alwaysShow: true, path: "" },
            { label: vscode.l10n.t("Select entry"), description: vscode.l10n.t("Select from the last journal entries."), pickItem: JournalPageType.entry, alwaysShow: true, path: "" },
            { label: vscode.l10n.t("Select/Create a note"), description: vscode.l10n.t("Create a new note or select one of your notes, newest first."), pickItem: JournalPageType.note, alwaysShow: true, path: "" },
            ...(this.config.getSearchSettings().enabled
                ? [{ label: vscode.l10n.t("Search journal"), description: vscode.l10n.t("Find entries and notes by name or text, newest first."), search: true, alwaysShow: true, path: "" }]
                : []),
        ];
    }

    /** The row for typed smart input (entry, task, memo, week). */
    public async inputItem(value: string): Promise<PickItem> {
        const parsed = await this.parser.parseInput(value);
        return {
            label: value,
            path: "",
            alwaysShow: true,
            parsedInput: parsed,
            replace: true,
            description: this.describeDate(parsed),
            detail: this.describeAction(parsed),
        };
    }

    /**
     * The row for a typed note title. The parser detects `#scope` and tags, and
     * resolves the path in that scope. The note is for today, or for the
     * current week with weekly entries; "note mon …" in the smart input picks a day (#149).
     */
    public async noteItem(value: string): Promise<PickItem> {
        const input = this.parser.noteInput(value);
        input.path = await this.parser.resolveNotePathForInput(input);

        let description = this.config.getScope(input.scope).isDefault
            ? vscode.l10n.t("Create new note in default path")
            : vscode.l10n.t("Create new note in scope \"{scope}\"", { scope: input.scope });
        if (input.tags.length > 0) {
            description += " " + vscode.l10n.t("and tags {tags}", { tags: input.tags.join(", ") });
        }
        return { label: input.text, path: input.path, alwaysShow: true, replace: true, parsedInput: input, description };
    }

    /** Rows for scanned files of the given type, without files already listed. */
    public fileItems(entries: FileEntry[], type: JournalPageType, listed: readonly PickItem[]): PickItem[] {
        const known = new Set(listed.map(item => item.path));
        return entries
            .filter(fe => fe.type === type && !known.has(fe.path))
            .map(fe => ({
                label: this.fileLabel(fe, type),
                // an icon, not "$(clock)" in the label: entryDecoration replaces it by a colored one (#7)
                iconPath: fe.type === JournalPageType.entry ? new vscode.ThemeIcon('clock') : undefined,
                path: fe.path, fileEntry: fe, description: this.fileDescription(fe),
            }));
    }

    /**
     * How an entry row shows what the entry holds (#7), read from the file:
     * see {@link decorateSummary}. Undefined if the file cannot be read.
     */
    public async entryDecoration(fe: FileEntry): Promise<EntryDecoration | undefined> {
        let text: string;
        try {
            text = new TextDecoder().decode(await this.fs.readFile(fe.path));
        } catch {
            return undefined;
        }
        const dir = Path.dirname(fe.path);
        return decorateSummary(entrySummary(text, target => !this.isEntry(Path.resolve(dir, target), fe.scope)));
    }

    /**
     * Whether a path is a daily or a weekly entry of the scope, in any layout
     * (#309), not a note: links to it (moved tasks, a week's daily links) are no notes.
     */
    private isEntry(fsPath: string, scopeId?: string): boolean {
        const scope = this.config.getScope(scopeId).isDefault ? undefined : scopeId;
        const base = this.config.getBasePath(scope);
        return this.config.getLayouts(scope).some(layout => matchPathTemplate(fsPath, entryTemplate(layout), base, layout.ext)?.day !== undefined)
            || getWeekFromPath(fsPath, this.config) !== undefined;
    }

    /**
     * The directories to scan for a page type: per scope and layout (the
     * current one and those of `journal.patternHistory`, #309), the fixed
     * folder its entry or notes template starts with (see templateSegments).
     * Duplicates are dropped.
     */
    public scanDirectories(type: JournalPageType): Set<ScopeDirectory> {
        const directories: ScopeDirectory[] = [];
        for (const scope of this.config.getScopeList()) {
            for (const layout of this.config.getLayouts(scope.name)) {
                if (type !== JournalPageType.entry && type !== JournalPageType.note) { continue; }
                const template = type === JournalPageType.entry ? entryTemplate(layout) : notesTemplate(layout);
                const path = templateSegments(template, this.config.getBasePath(scope.name)).root;
                if (stringIsNotEmpty(path) && !directories.some(dir => dir.path === path)) {
                    directories.push({ path, scope: scope.name });
                }
            }
        }
        return new Set(directories);
    }

    /** The day or week the input goes to; a week has no day offset. */
    private describeDate(parsed: Input): string {
        moment.locale(this.config.getLocale());
        const target = parsed.hasWeek()
            ? vscode.l10n.t("Week {week}", { week: parsed.week })
            : moment(parsed.generateDate()).format("ddd, LL");

        if (parsed.confidence === 'resolved') { return `$(check) ${target}`; }
        if (parsed.confidence === 'ambiguous') { return `$(warning) ${target}`; }
        return target;
    }

    private describeAction(parsed: Input): string {
        if (parsed.hasWeek()) {
            const week = { week: parsed.week };
            if (parsed.kind === 'note') { return vscode.l10n.t("Create note linked from week {week}", week); }
            return parsed.hasTask()
                ? vscode.l10n.t("Add task to entry for week {week}", week)
                : vscode.l10n.t("Open notes for week {week}", week);
        }
        moment.locale(this.config.getLocale());
        const time = moment(parsed.generateDate()).calendar(moment(), this.config.getInputDetailsTimeFormat());
        if (parsed.kind === 'note') {
            return vscode.l10n.t("Create note linked from entry {day}", { day: time });
        }
        if (parsed.hasTask()) {
            return vscode.l10n.t("Add task to entry {day}", { day: time });
        }
        if (parsed.hasMemo()) {
            return vscode.l10n.t("Add memo to entry {day}", { day: time });
        }
        return vscode.l10n.t("Create or open entry {day}", { day: time });
    }

    private fileLabel(fe: FileEntry, type: JournalPageType): string {
        let name = fe.name;
        if (type === JournalPageType.entry) {
            // journal pages are prefixed with their month
            const parts = fe.path.split(Path.sep);
            name = parts[parts.length - 2] + Path.sep + parts[parts.length - 1];
        } else if (type === JournalPageType.note) {
            name = denormalizeFilename(fe.name);
        }

        switch (fe.type) {
            case JournalPageType.note:
                return this.config.getScope(fe.scope).isDefault ? `$(circle-large-outline) ${name}` : `$(circle-large-filled) ${name}`;
            case JournalPageType.attachment: return `$(package) ${name}`;
            default: return name;
        }
    }

    /**
     * Rows for search hits, in the order of the hits: the title, the day it
     * belongs to and its scope, and the matching line. The rows are filtered
     * by the search, not again by the QuickPick (alwaysShow).
     */
    public searchItems(hits: SearchHit[]): PickItem[] {
        return hits.map(hit => {
            const icon = hit.entry.type === JournalPageType.note ? '$(note)' : hit.entry.type === JournalPageType.weekly ? '$(calendar)' : '$(clock)';
            const scope = this.config.getScope(hit.entry.scope).isDefault ? '' : ` | #${hit.entry.scope}`;
            return {
                label: `${icon} ${hit.title}`,
                description: moment(hit.date).locale(this.config.getLocale()).format('ll') + scope,
                detail: hit.text,
                path: hit.entry.path,
                line: hit.line,
                alwaysShow: true,
            };
        });
    }

    /**
     * "from Monday" within the last week, otherwise the date; plus the scope
     * tag. The date is the day the file belongs to (its path, else its
     * creation date; see {@link getJournalDate}), not the creation date of the
     * file on this disk, which for a copied or cloned journal is the day of the copy.
     */
    public fileDescription(fe: FileEntry): string {
        let description = "";
        try {
            const date = moment(fe.journalDate);
            description += date.isAfter(moment().subtract(7, "d")) && date.isBefore(moment())
                ? date.format(vscode.l10n.t("[from] dddd"))
                : date.format(vscode.l10n.t("[from] ll"));
        } catch (error) {
            console.error("Failed to extract date from entry with name: ", fe.name, error);
        }
        if (!this.config.getScope(fe.scope).isDefault) {
            description += ` | #${fe.scope}`;
        }
        return description;
    }
}

/** The items with the typed-input row in front (replacing the previous one); none removes it. */
export function withPlaceholder(items: readonly PickItem[], placeholder?: PickItem): PickItem[] {
    const rest = items.length > 0 && items[0].replace === true ? items.slice(1) : [...items];
    return placeholder ? [placeholder, ...rest] : rest;
}

/**
 * Inserts file rows sorted (#187: binary search instead of re-sorting the
 * growing list on every scan callback). Rows without file stay in front.
 */
export function mergeSorted(items: readonly PickItem[], added: PickItem[]): PickItem[] {
    const merged = [...items];
    for (const item of added) {
        if (!item.fileEntry) {
            merged.push(item);
            continue;
        }
        let lo = 0;
        let hi = merged.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            const midEntry = merged[mid].fileEntry;
            if (!midEntry || sortPickEntries(midEntry, item.fileEntry) <= 0) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        merged.splice(lo, 0, item);
    }
    return merged;
}

/** The icon and the detail line of an entry row (#7); unset fields leave the row as it is. */
export interface EntryDecoration {
    iconPath?: vscode.ThemeIcon;
    detail?: string;
}

/**
 * The tasks as the row's icon: a yellow warning while tasks are open, a green
 * check when all are done, the clock (unchanged) without tasks. The detail
 * line: the number of open tasks and the linked notes ("2 open tasks · 3 notes").
 */
export function decorateSummary(summary: EntrySummary): EntryDecoration {
    const decoration: EntryDecoration = {};
    if (summary.tasks > 0) {
        decoration.iconPath = summary.open > 0
            ? new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'))
            : new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
    }
    const parts: string[] = [];
    if (summary.open > 0) {
        parts.push(summary.open === 1 ? vscode.l10n.t("1 open task") : vscode.l10n.t("{open} open tasks", { open: summary.open }));
    }
    if (summary.notes > 0) {
        parts.push(summary.notes === 1 ? vscode.l10n.t("1 note") : vscode.l10n.t("{notes} notes", { notes: summary.notes }));
    }
    if (parts.length > 0) {
        decoration.detail = parts.join(" · ");
    }
    return decoration;
}
