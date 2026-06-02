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
import { IConfiguration, IFileSystem, ILogger, IWorkspaceConfigReader, JournalController } from '../model';
import { Configuration } from '../vscode/conf';
import { Parser } from '../journal/parser';
import { Writer } from '../journal/writer';
import { Reader } from '../journal/reader';
import { Inject } from '../journal/inject';
import { Dialogues } from '../vscode/dialogues';
import { VscodeFileSystem } from '../vscode/vscode-fs';

/**
 * Builds the logger once the configuration is available. The logger needs the
 * configuration (for trace/dev settings), so the container resolves the config
 * first and then hands it to this factory — single-pass, no two-phase init.
 */
export type LoggerFactory = (config: IConfiguration) => ILogger;

/**
 * Composition root. Constructs the full service graph in one pass and exposes
 * it through the {@link JournalController} interface. Consumers depend on the
 * interface, never on this concrete class — only the registration layer
 * (`app/`) instantiates it.
 */
export class Container implements JournalController {

    public readonly config: Configuration;
    public readonly logger: ILogger;
    public readonly fs: IFileSystem;
    public readonly inject: Inject;
    public readonly parser: Parser;
    public readonly ui: Dialogues;
    public readonly writer: Writer;
    public readonly reader: Reader;

    constructor(configSource: IWorkspaceConfigReader, loggerFactory: LoggerFactory) {
        this.config = new Configuration(configSource);
        this.logger = loggerFactory(this.config);
        this.fs = new VscodeFileSystem();
        this.inject = new Inject(this.config, this.logger);
        this.parser = new Parser(this.config, this.logger);
        this.ui = new Dialogues(this.config, this.logger, this.parser, this.fs);
        this.writer = new Writer(this.config, this.logger, this.inject, this.fs,
            async (path) => vscode.workspace.openTextDocument(vscode.Uri.file(path)));
        this.reader = new Reader(this.config, this.logger, this.writer, this.ui, this.fs);
    }
}
