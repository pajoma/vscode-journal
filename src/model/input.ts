// Copyright (C) 2018 Patrick Maué
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

import { isUndefined } from "util";

export default class Input {

  
    private _offset: number; 
    private _flags: string = ""; 
    private _text: string = ""; 
    private _scope: string = "default"; 
    private _tags: string[] = [""]; 

    constructor(offset?: number) {
        this._offset = (isUndefined(offset)) ? 0 : offset; 
    }


    /**
     * Getter offset
     * @return {number }
     */
	public get offset(): number  {
		return this._offset;
	}

    public get tags(): string[] {
        return this._tags; 
    }

    /**
     * Getter flags
     * @return {string }
     */
	public get flags(): string  {
		return this._flags;
	}

    /**
     * Getter text
     * @return {string }
     */
	public get text(): string  {
		return this._text;
	}

    /**
     * Getter scope
     * @return {string }
     */
	public get scope(): string  {
		return this._scope;
	}

    /**
     * Setter offset
     * @param {number } value
     */
	public set offset(value: number ) {
		this._offset = value;
	}

    /**
     * Setter flags
     * @param {string } value
     */
	public set flags(value: string ) {
		this._flags = value;
	}

    /**
     * Setter text
     * @param {string } value
     */
	public set text(value: string ) {
		this._text = value;
	}

    public set tags(values: string[]) {
        this._tags = values; 
    }

    /**
     * Setter scope
     * @param {string } value
     */
	public set scope(value: string ) {
		this._scope = value;
    }


    public hasMemo(): boolean {
        return this.text.length > 0; 
    }

    public hasFlags(): boolean {
        return this.flags.length > 0; 
    }

    public hasOffset(): boolean {
        return !isNaN(this.offset); 
    }
    
}