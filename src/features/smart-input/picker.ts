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
import { FileEntry, EditorSettings, ILogger, Input, JournalPageType, SCOPE_DEFAULT, SelectedInput } from '../../shared/model/index';
import { mergeSorted, PickerContent, PickItem, withPlaceholder } from './picker-content';
import { ScanEntries } from './scan-entries';
import { SearchIndex } from './search-index';

/** The spinner stops after this many rows or this long: the directory walk does not report when it is done. */
const BUSY_MAX_ITEMS = 20;
const BUSY_MAX_MS = 3000;
/** The search runs this long after the last keystroke. */
const SEARCH_DELAY_MS = 120;

/**
 * The smart-input QuickPick UI. What it shows comes from {@link PickerContent};
 * here are only the QuickPick, its events and the live placeholder row.
 */
export class Picker {

    private refreshing?: Promise<void>;

    constructor(
        private readonly content: PickerContent,
        private readonly scanner: ScanEntries,
        private readonly index: SearchIndex,
        private readonly config: EditorSettings,
        private readonly logger: ILogger,
    ) { }

    /**
     * First-level picker: typed smart input, today, tomorrow, or one of the
     * second-level pickers. Resolves undefined when the user closes it (Esc):
     * cancelling is not an error.
     */
    public getUserInput(): Promise<Input | undefined> {
        return new Promise(resolve => {
            const { quickPick, disposables } = this.create(resolve);
            quickPick.items = this.content.startItems();
            let selected: PickItem | undefined;

            quickPick.onDidChangeValue(value => this.updatePlaceholder(quickPick, value, v => this.content.inputItem(v)), undefined, disposables);
            quickPick.onDidChangeSelection(sel => { selected = sel[0]; }, undefined, disposables);
            quickPick.onDidAccept(() => {
                if (!selected) { return; }
                // resolving with a promise locks this picker's result to it, so the hide that follows
                // cannot cancel it. The second-level picker opens only afterwards (then), because
                // opening it hides this one.
                if (selected.parsedInput) {
                    resolve(selected.parsedInput);
                } else if (selected.search) {
                    resolve(Promise.resolve().then(() => this.search()));
                } else if (selected.pickItem !== undefined) {
                    resolve(Promise.resolve(selected.pickItem).then(type => this.pickItem(type)));
                }
                quickPick.hide();
            }, undefined, disposables);

            quickPick.show();
        });
    }

    /**
     * Second-level picker: recent entries or notes; for notes also a row to
     * create the typed note. Resolves undefined when closed without a choice.
     */
    public pickItem(type: JournalPageType): Promise<Input | undefined> {
        return new Promise(resolve => {
            const { quickPick, disposables } = this.create(resolve);
            quickPick.matchOnDescription = true;
            quickPick.busy = true;
            const start = Date.now();
            let selected: PickItem | undefined;

            const addEntries = (entries: FileEntry[]) => {
                const added = this.content.fileItems(entries, type, quickPick.items);
                quickPick.items = mergeSorted(quickPick.items, added);
                if (quickPick.items.length > BUSY_MAX_ITEMS || Date.now() - start > BUSY_MAX_MS) {
                    quickPick.busy = false;
                }
                if (type === JournalPageType.entry) {
                    this.addEntryDetails(quickPick, added).catch(error => this.logger.trace("Warning: " + error));
                }
            };
            this.scanner.getPreviouslyAccessedFiles(this.config.getInputTimeThreshold(), type, this.content.scanDirectories(type), addEntries);

            quickPick.onDidChangeSelection(sel => { selected = sel[0]; }, undefined, disposables);
            if (type === JournalPageType.note) {
                quickPick.onDidChangeValue(value => this.updatePlaceholder(quickPick, value, v => this.content.noteItem(v)), undefined, disposables);
            }
            quickPick.onDidAccept(() => {
                if (selected) { resolve(selected.parsedInput ?? new SelectedInput(selected.path)); }
                quickPick.hide();
            }, undefined, disposables);

            quickPick.show();
        });
    }

    /**
     * The smart search (#300): rescans the journal folders, reads new and
     * changed files, then shows the hits for the typed words, newest first.
     * Resolves undefined when closed without a choice.
     */
    public search(): Promise<Input | undefined> {
        return new Promise(resolve => {
            const { quickPick, disposables } = this.create(resolve);
            quickPick.placeholder = vscode.l10n.t("Search entries and notes: words, #scope");
            quickPick.busy = true;
            let selected: PickItem | undefined;
            let timer: ReturnType<typeof setTimeout> | undefined;

            const show = () => { quickPick.items = this.content.searchItems(this.index.search(quickPick.value)); };
            this.refreshIndex(show)
                .catch(error => this.logger.error("Failed to read the journal for the search.", error))
                .finally(() => { quickPick.busy = false; show(); });

            quickPick.onDidChangeValue(() => {
                clearTimeout(timer);
                timer = setTimeout(show, SEARCH_DELAY_MS);
            }, undefined, disposables);
            disposables.push({ dispose: () => clearTimeout(timer) });
            quickPick.onDidChangeSelection(sel => { selected = sel[0]; }, undefined, disposables);
            quickPick.onDidAccept(() => {
                if (selected) { resolve(new SelectedInput(selected.path, selected.line)); }
                quickPick.hide();
            }, undefined, disposables);

            quickPick.show();
        });
    }

    /**
     * All journal files, scanned again: files may have been added or changed
     * outside of this window. Calls `scanned` when they can be found by name;
     * their text is read afterwards (the first time takes a few seconds).
     * A refresh that is still running (e.g. the one at startup) is shared, so
     * the index is never filled twice at the same time.
     */
    public refreshIndex(scanned: () => void = () => undefined): Promise<void> {
        if (this.refreshing) {
            scanned();
            return this.refreshing;
        }
        this.refreshing = this.scanAndRead(scanned).finally(() => { this.refreshing = undefined; });
        return this.refreshing;
    }

    private async scanAndRead(scanned: () => void): Promise<void> {
        const directories = [...this.content.scanDirectories(JournalPageType.entry), ...this.content.scanDirectories(JournalPageType.note)];
        // the default scope first, so files in scope folders below the base keep their scope
        directories.sort((a, b) => Number(a.scope !== SCOPE_DEFAULT) - Number(b.scope !== SCOPE_DEFAULT));
        this.scanner.clearCache();
        this.index.setFiles(await this.scanner.getPreviouslyAccessedFilesSync(this.config.getInputTimeThreshold(), directories));
        scanned();
        await this.index.readChanged();
    }

    /**
     * Fills in the detail line (tasks and notes, #7) of the given entry rows
     * once their files are read, so the rows show up without waiting. The
     * highlighted row stays highlighted.
     */
    private async addEntryDetails(quickPick: vscode.QuickPick<PickItem>, rows: PickItem[]): Promise<void> {
        const details = new Map<string, string>();
        await Promise.all(rows.map(async row => {
            const detail = row.fileEntry && await this.content.entryDetail(row.fileEntry);
            if (detail) { details.set(row.path, detail); }
        }));
        if (details.size === 0) { return; }
        const active = new Set((quickPick.activeItems ?? []).map(item => item.path));
        quickPick.items = quickPick.items.map(item => details.has(item.path) ? { ...item, detail: details.get(item.path) } : item);
        if (active.size > 0) {
            quickPick.activeItems = quickPick.items.filter(item => active.has(item.path));
        }
    }

    /** A QuickPick that cleans up when hidden and then settles the picker as cancelled (a no-op if already resolved). */
    private create(resolve: (input: Input | undefined) => void): { quickPick: vscode.QuickPick<PickItem>; disposables: vscode.Disposable[] } {
        const quickPick = vscode.window.createQuickPick<PickItem>();
        const disposables: vscode.Disposable[] = [];
        quickPick.onDidHide(() => {
            disposables.forEach(d => d.dispose());
            quickPick.dispose();
            resolve(undefined);
        }, undefined, disposables);
        return { quickPick, disposables };
    }

    /** Shows the row for the typed value in front of the list (removed when the value is cleared). */
    private updatePlaceholder(quickPick: vscode.QuickPick<PickItem>, value: string, toItem: (value: string) => Promise<PickItem>): void {
        if (value.length === 0) {
            quickPick.items = withPlaceholder(quickPick.items);
            return;
        }
        // a late answer for an outdated value must not change the current row
        const isCurrent = () => quickPick.value === value;
        toItem(value)
            .then(item => { if (isCurrent()) { quickPick.items = withPlaceholder(quickPick.items, item); } })
            .catch(error => {
                // no row for a value that does not parse ("task" without text): Enter must not run the previous one
                if (isCurrent()) { quickPick.items = withPlaceholder(quickPick.items); }
                this.logger.trace("Warning: " + error);
            });
    }
}
