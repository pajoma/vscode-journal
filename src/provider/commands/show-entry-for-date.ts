// Copyright (C) 2021  Patrick Maué
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
import * as J from '../..';
import { NoteInput, SelectedInput } from '../../model';


export class AbstractLoadEntryForDateCommand implements vscode.Disposable {

    protected constructor(public ctrl: J.Util.Ctrl) { }

    public async dispose(): Promise<void> {
        // do nothing
    }

    /**
     * Implements commands "yesterday", "today", "yesterday", where the input is predefined (no input box appears)
     * @param offset 
     */
    public async execute(input: J.Model.Input ): Promise<void> {

        try {
            const doc = await this.loadPageForInput(input);
            await this.ctrl.ui.showDocument(doc);
        } catch (error) {
            if (error !== 'cancel') {
                this.ctrl.logger.error("Failed to load entry for input: ", input.text, "Reason: ", error);
                this.ctrl.ui.showError("Failed to open entry.");
            } else {return;} 
        }
    }



    /**
     * Expects any user input from the magic input and either opens the file or creates it. 
     * @param input 
     */
     protected async loadPageForInput(input: J.Model.Input): Promise<vscode.TextDocument> {

        if (input instanceof SelectedInput) {
            // we just load the path
            return this.ctrl.ui.openDocument((<SelectedInput>input).path);
        } if (input instanceof NoteInput) {
            // we create or load the notes
            return new J.Provider.LoadNotes(input, this.ctrl).loadWithPath(input.path);

        } else {
            return this.ctrl.reader.loadEntryForInput(input)
                .then((doc: vscode.TextDocument) => this.ctrl.inject.injectInput(doc, input));
        }
    }
}