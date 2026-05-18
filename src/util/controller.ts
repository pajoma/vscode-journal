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


import * as J from '../.';
import * as vscode from 'vscode';
import { IFileSystem, ILogger, JournalController } from '../model';
import { Parser } from '../journal/parser';
import { Writer } from '../journal/writer';
import { Reader } from '../journal/reader';
import { Inject } from '../journal/inject';
import { Dialogues } from '../vscode/dialogues';
import { VscodeFileSystem } from '../vscode/vscode-fs';

export class Ctrl implements JournalController {


    private _config: J.VSCode.Configuration;
    private _ui!: J.VSCode.Dialogues;
    private _parser!: J.Journal.Parser;
    private _writer!: J.Journal.Writer;
    private _reader!: J.Journal.Reader;
    private _logger: J.Util.Logger | undefined;
    private _inject!: J.Journal.Inject;
    private _fs!: IFileSystem;

    constructor(vscodeConfig: vscode.WorkspaceConfiguration) {
        this._config = new J.VSCode.Configuration(vscodeConfig);
    }

    public initServices(logger: ILogger): void {
        this._logger = logger as J.Util.Logger;
        this._fs = new VscodeFileSystem();
        this._inject = new Inject(this._config, logger);
        this._parser = new Parser(this._config, logger);
        this._ui = new Dialogues(this._config, logger, this._parser, this._fs);
        this._writer = new Writer(this._config, logger, this._inject, this._fs,
            async (path) => vscode.workspace.openTextDocument(vscode.Uri.file(path)));
        this._reader = new Reader(this._config, logger, this._writer, this._ui, this._fs);
    }



    /**
     * Getter $ui
     * @return {J.VSCode.VSCode}
     */
    public get ui(): J.VSCode.Dialogues {
        return this._ui;
    }

    /**
     * Getter $writer
     * @return {J.Journal.Writer}
     */
    public get writer(): J.Journal.Writer {
        return this._writer;
    }

    /**
     * Getter $reader
     * @return {J.Journal.Reader}
     */
    public get reader(): J.Journal.Reader {
        return this._reader;
    }

    /**
     * Getter $parser
     * @return {J.Journal.Parser}
     */
    public get parser(): J.Journal.Parser {
        return this._parser;
    }

    /**
     * Getter $config
     * @return {J.VSCode.Configuration}
     */
    public get config(): J.VSCode.Configuration {
        return this._config;
    }

    /**
     * Getter inject
     * @return {J.Journal.Inject}
     */
    public get inject(): J.Journal.Inject {
        return this._inject;
    }

       /**
     * Getter logger
     * @return {J.Util.Logger}
     */
	public get logger(): J.Util.Logger  {
        if(J.Util.isNullOrUndefined(this._logger)) { throw Error("Tried to access undefined logger in journal"); }
		return this._logger!;
	}

    public get fs(): IFileSystem {
        return this._fs;
    }

}