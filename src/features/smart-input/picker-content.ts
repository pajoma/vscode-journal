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
import { FileEntry, IConfiguration, IParser, Input, JournalPageType, NoteInput, ScopeDirectory } from '../../shared/model/index';
import { sortPickEntries } from './scan-entries';

/** A row of the smart-input picker. */
export interface PickItem extends vscode.QuickPickItem {
    /** The input this row stands for; resolved on accept. */
    parsedInput?: Input;
    /** The row mirroring what the user types; replaced on every keystroke. */
    replace?: boolean;
    path: string;
    /** Opens the second-level picker for this type. */
    pickItem?: JournalPageType;
    fileEntry?: FileEntry;
}

/**
 * What the smart-input picker shows: start rows, the row for the typed input,
 * the rows for scanned files and the directories to scan. No QuickPick here;
 * the UI lives in {@link Picker}.
 */
export class PickerContent {

    constructor(private readonly config: IConfiguration, private readonly parser: IParser) { }

    /** The fixed rows of the first-level picker. */
    public startItems(): PickItem[] {
        return [
            { label: vscode.l10n.t("Today"), description: vscode.l10n.t("Jump to today's entry."), pickItem: JournalPageType.entry, parsedInput: new Input(0), alwaysShow: true, path: "" },
            { label: vscode.l10n.t("Tomorrow"), description: vscode.l10n.t("Jump to tomorrow's entry."), pickItem: JournalPageType.entry, parsedInput: new Input(1), alwaysShow: true, path: "" },
            { label: vscode.l10n.t("Select entry"), description: vscode.l10n.t("Select from the last journal entries."), pickItem: JournalPageType.entry, alwaysShow: true, path: "" },
            { label: vscode.l10n.t("Select/Create a note"), description: vscode.l10n.t("Create a new note or select from recently created or updated notes."), pickItem: JournalPageType.note, alwaysShow: true, path: "" },
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
     * resolves the path in that scope.
     */
    public async noteItem(value: string): Promise<PickItem> {
        const input = new NoteInput();
        input.text = value;
        input.path = await this.parser.resolveNotePathForInput(input);

        let description = this.config.getScope(input.scope).isDefault
            ? "Create new note in default path"
            : "Create new note in scope \"" + input.scope + "\"";
        if (input.tags.length > 0) {
            description += " and tags " + input.tags;
        }
        return { label: input.text, path: input.path, alwaysShow: true, replace: true, parsedInput: input, description };
    }

    /** Rows for scanned files of the given type, without files already listed. */
    public fileItems(entries: FileEntry[], type: JournalPageType, listed: readonly PickItem[]): PickItem[] {
        const known = new Set(listed.map(item => item.path));
        return entries
            .filter(fe => fe.type === type && !known.has(fe.path))
            .map(fe => ({ label: this.fileLabel(fe, type), path: fe.path, fileEntry: fe, description: this.fileDescription(fe) }));
    }

    /**
     * The directories to scan for a page type: per scope, its entry or notes
     * path up to the first variable (e.g. `${year}`). Duplicates are dropped.
     */
    public scanDirectories(type: JournalPageType): Set<ScopeDirectory> {
        const directories: ScopeDirectory[] = [];
        for (const scope of this.config.getScopeList()) {
            const pattern = type === JournalPageType.entry ? this.config.getEntryPathPattern(scope.name)
                : type === JournalPageType.note ? this.config.getNotesPathPattern(scope.name)
                    : "";
            const resolved = Path.normalize(pattern.replace("${base}", this.config.getBasePath(scope.name)));

            const fixed: string[] = [];
            for (const segment of resolved.split(Path.sep)) {
                if (segment.startsWith("${")) { break; }
                fixed.push(segment);
            }
            // join, not Path.join(...): that drops the leading empty segment of an absolute POSIX path
            const path = fixed.join(Path.sep);
            if (stringIsNotEmpty(path) && !directories.some(dir => dir.path === path)) {
                directories.push({ path, scope: scope.name });
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
        if (parsed.hasWeek() && !parsed.hasTask()) {
            return vscode.l10n.t("Open notes for week {week}", { week: parsed.week });
        }
        if (parsed.hasWeek() && parsed.hasTask()) {
            return vscode.l10n.t("Add task to entry for week {week}", { week: parsed.week });
        }
        moment.locale(this.config.getLocale());
        const time = moment(parsed.generateDate()).calendar(moment(), this.config.getInputDetailsTimeFormat());
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
            case JournalPageType.entry: return `$(clock) ${name}`;
            case JournalPageType.attachment: return `$(package) ${name}`;
            default: return name;
        }
    }

    /** "from Monday" within the last week, otherwise the date; plus the scope tag. */
    private fileDescription(fe: FileEntry): string {
        let description = "";
        try {
            const date = moment(fe.createdAt);
            description += date.isAfter(moment().subtract(7, "d"))
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
