// Copyright (C) 2018  Patrick Maué
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
import { EntryOpenedEvent, IJournalEvents } from '../model';

/**
 * Typed cross-feature event bus backed by `vscode.EventEmitter`. Features
 * publish signals here and subscribe to others' signals, so no feature has to
 * import another feature's internals (#234).
 */
export class JournalEvents implements IJournalEvents, vscode.Disposable {

    private readonly entryOpened = new vscode.EventEmitter<EntryOpenedEvent>();
    public readonly onEntryOpened = this.entryOpened.event;

    public fireEntryOpened(event: EntryOpenedEvent): void {
        this.entryOpened.fire(event);
    }

    public dispose(): void {
        this.entryOpened.dispose();
    }
}
