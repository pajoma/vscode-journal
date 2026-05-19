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
import { IFileSystem, ILogger, IWorkspaceConfigReader, JournalController } from '../model';
import { Configuration } from '../vscode/conf';
import { Parser } from '../journal/parser';
import { Writer } from '../journal/writer';
import { Reader } from '../journal/reader';
import { Inject } from '../journal/inject';
import { Dialogues } from '../vscode/dialogues';
import { VscodeFileSystem } from '../vscode/vscode-fs';
import { isNullOrUndefined } from './util';

export class Ctrl implements JournalController {


    private _config: Configuration;
    private _ui!: Dialogues;
    private _parser!: Parser;
    private _writer!: Writer;
    private _reader!: Reader;
    private _logger: ILogger | undefined;
    private _inject!: Inject;
    private _fs!: IFileSystem;

    constructor(configSource: IWorkspaceConfigReader) {
        this._config = new Configuration(configSource);
    }

    public initServices(logger: ILogger): void {
        this._logger = logger;
        this._fs = new VscodeFileSystem();
        this._inject = new Inject(this._config, logger);
        this._parser = new Parser(this._config, logger);
        this._ui = new Dialogues(this._config, logger, this._parser, this._fs);
        this._writer = new Writer(this._config, logger, this._inject, this._fs,
            async (path) => vscode.workspace.openTextDocument(vscode.Uri.file(path)));
        this._reader = new Reader(this._config, logger, this._writer, this._ui, this._fs);
    }



    public get ui(): Dialogues {
        return this._ui;
    }

    public get writer(): Writer {
        return this._writer;
    }

    public get reader(): Reader {
        return this._reader;
    }

    public get parser(): Parser {
        return this._parser;
    }

    public get config(): Configuration {
        return this._config;
    }

    public get inject(): Inject {
        return this._inject;
    }

    public get logger(): ILogger {
        if (isNullOrUndefined(this._logger)) { throw Error("Tried to access undefined logger in journal"); }
        return this._logger!;
    }

    public get fs(): IFileSystem {
        return this._fs;
    }

}