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
import { FileEntry, IConfiguration, ILogger, Input, JournalPageType, SelectedInput } from '../../shared/model/index';
import { mergeSorted, PickerContent, PickItem, withPlaceholder } from './picker-content';
import { ScanEntries } from './scan-entries';

/** The spinner stops after this many rows or this long: the directory walk does not report when it is done. */
const BUSY_MAX_ITEMS = 20;
const BUSY_MAX_MS = 3000;

/**
 * The smart-input QuickPick UI. What it shows comes from {@link PickerContent};
 * here are only the QuickPick, its events and the live placeholder row.
 */
export class Picker {

    constructor(
        private readonly content: PickerContent,
        private readonly scanner: ScanEntries,
        private readonly config: IConfiguration,
        private readonly logger: ILogger,
    ) { }

    /** First-level picker: typed smart input, today, tomorrow, or one of the second-level pickers. */
    public getUserInput(): Promise<Input> {
        return new Promise((resolve, reject) => {
            const { quickPick, disposables } = this.create();
            quickPick.items = this.content.startItems();
            let selected: PickItem | undefined;

            quickPick.onDidChangeValue(value => this.updatePlaceholder(quickPick, value, v => this.content.inputItem(v)), undefined, disposables);
            quickPick.onDidChangeSelection(sel => { selected = sel[0]; }, undefined, disposables);
            quickPick.onDidAccept(() => {
                if (!selected) { return; }
                if (selected.parsedInput) {
                    resolve(selected.parsedInput);
                } else if (selected.pickItem !== undefined) {
                    this.pickItem(selected.pickItem).then(resolve, reject);
                } else {
                    this.content.inputItem(selected.label).then(item => resolve(item.parsedInput!), reject);
                }
            }, undefined, disposables);

            quickPick.show();
        });
    }

    /** Second-level picker: recent entries or notes; for notes also a row to create the typed note. */
    public pickItem(type: JournalPageType): Promise<Input> {
        return new Promise((resolve, reject) => {
            const { quickPick, disposables } = this.create();
            quickPick.matchOnDescription = true;
            quickPick.busy = true;
            const start = Date.now();
            let selected: PickItem | undefined;

            const addEntries = (entries: FileEntry[]) => {
                quickPick.items = mergeSorted(quickPick.items, this.content.fileItems(entries, type, quickPick.items));
                if (quickPick.items.length > BUSY_MAX_ITEMS || Date.now() - start > BUSY_MAX_MS) {
                    quickPick.busy = false;
                }
            };
            this.scanner.getPreviouslyAccessedFiles(this.config.getInputTimeThreshold(), type, this.content.scanDirectories(type), addEntries);

            quickPick.onDidChangeSelection(sel => { selected = sel[0]; }, undefined, disposables);
            if (type === JournalPageType.note) {
                quickPick.onDidChangeValue(value => this.updatePlaceholder(quickPick, value, v => this.content.noteItem(v)), undefined, disposables);
            }
            quickPick.onDidAccept(() => {
                if (!selected) { reject("cancel"); return; }
                resolve(selected.parsedInput ?? new SelectedInput(selected.path));
            }, undefined, disposables);

            quickPick.show();
        });
    }

    private create(): { quickPick: vscode.QuickPick<PickItem>; disposables: vscode.Disposable[] } {
        const quickPick = vscode.window.createQuickPick<PickItem>();
        const disposables: vscode.Disposable[] = [];
        quickPick.onDidHide(() => {
            disposables.forEach(d => d.dispose());
            quickPick.dispose();
        }, undefined, disposables);
        return { quickPick, disposables };
    }

    /** Shows the row for the typed value in front of the list (removed when the value is cleared). */
    private updatePlaceholder(quickPick: vscode.QuickPick<PickItem>, value: string, toItem: (value: string) => Promise<PickItem>): void {
        if (value.length === 0) {
            quickPick.items = withPlaceholder(quickPick.items);
            return;
        }
        toItem(value)
            // a late answer for an outdated value must not replace the current row
            .then(item => { if (quickPick.value === value) { quickPick.items = withPlaceholder(quickPick.items, item); } })
            .catch(error => this.logger.trace("Warning: " + error));
    }
}
