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

export class Ctrl {


    private _config: J.Extension.Configuration;
    private _ui: J.Extension.Dialogues;
    private _parser: J.Actions.Parser;
    private _writer: J.Actions.Writer;
    private _reader: J.Actions.Reader;

 
    private _logger: J.Util.Logger | undefined; 


    private _inject: J.Actions.Inject;

    
    constructor(vscodeConfig: vscode.WorkspaceConfiguration) {
        this._config = new J.Extension.Configuration(vscodeConfig);
        this._parser = new J.Actions.Parser(this);
        this._writer = new J.Actions.Writer(this);
        this._reader = new J.Actions.Reader(this);
        this._inject = new J.Actions.Inject(this);
        this._ui = new J.Extension.Dialogues(this);
    }



    /**
     * Getter $ui
     * @return {J.Extension.VSCode}
     */
    public get ui(): J.Extension.Dialogues {
        return this._ui;
    }

    /**
     * Getter $writer
     * @return {J.Actions.Writer}
     */
    public get writer(): J.Actions.Writer {
        return this._writer;
    }

    /**
     * Getter $reader
     * @return {J.Actions.Reader}
     */
    public get reader(): J.Actions.Reader {
        return this._reader;
    }

    /**
     * Getter $parser
     * @return {J.Actions.Parser}
     */
    public get parser(): J.Actions.Parser {
        return this._parser;
    }

    /**
     * Getter $config
     * @return {J.Extension.Configuration}
     */
    public get config(): J.Extension.Configuration {
        return this._config;
    }

    /**
     * Getter inject
     * @return {J.Actions.Inject}
     */
    public get inject(): J.Actions.Inject {
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

    /**
     * Setter logger
     * @param {J.Util.Logger} value
     */
	public set logger(value: J.Util.Logger) {
		this._logger = value;
	}


}