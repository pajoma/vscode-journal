// Copyright (C) 2016  Patrick Maué
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
import { isNotNullOrUndefined, isString, isError } from '../../shared/index';
import { IConfiguration, IFileSystem, ILogger, IParser, JournalPageType, Input } from '../../shared/model/index';
import { PickerContent } from './picker-content';
import { Picker } from './picker';
import { JournalScan, ScanEntries } from './scan-entries';
import { PageTexts } from '../../shared/journal/page-texts';
import { SearchIndex } from './search-index';


/**
 * User interaction: the smart-input picker (delegated to {@link Picker}),
 * prompts, opening/saving/showing documents and error messages.
 */
export class Dialogues {

    private scanner: ScanEntries;
    private picker: Picker;

    /** `scan`: the journal's one scan, `texts` its text cache (#320). */
    constructor(private config: IConfiguration, private logger: ILogger, parser: IParser, fs: IFileSystem, texts: PageTexts, scan: () => JournalScan) {
        this.scanner = new ScanEntries(config, logger, fs, scan);
        this.picker = new Picker(new PickerContent(config, parser, texts), this.scanner, new SearchIndex(config, texts, () => config.getSearchSettings()), config, logger);
    }

    public getScanner(): ScanEntries {
        return this.scanner;
    }


    /** The smart-input picker; see {@link Picker}. Undefined: the user cancelled. */
    public getUserInputWithValidation(): Promise<Input | undefined> {
        return this.picker.getUserInput();
    }

    public pickItem(type: JournalPageType): Promise<Input | undefined> {
        return this.picker.pickItem(type);
    }

    public search(): Promise<Input | undefined> {
        return this.picker.search();
    }

    /** Builds the search index in the background, so the first search needs not wait for it (#300). */
    public prepareSearch(): Promise<void> {
        return this.picker.refreshIndex();
    }



    /** 
     * Simple method to have Q Promise for vscode API call to get user input 
     */
    public async getUserInput(tip: string): Promise<string> {
        this.logger.trace("Entering getUserInput() in ext/vscode.ts");
        const value = await vscode.window.showInputBox({ prompt: tip });
        if (isNotNullOrUndefined(value) && value!.length > 0) {
            return value!;
        }
        this.logger.debug("User canceled");
        throw new Error("cancel");
    }


    public async showError(error: string | Error): Promise<void> {

        if (isString(error)) {
            this.showErrorInternal(error as string);
        }

        if (isError(error)) {
            this.showErrorInternal((error as Error).message);
        }
    }

    private showErrorInternal(errorMessage: string): void {
        let hint = "Open the logs to see details.";
        vscode.window.showErrorMessage(errorMessage, hint)
            .then(clickedHint => {
                this.logger.showChannel();
            });
    }
}
