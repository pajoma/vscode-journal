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

import { isNullOrUndefined } from "../util/util";

export class Input {


    
    private _offset: number; 
    private _flags: string = ""; 
    private _text: string = ""; 
    private _scope: string = ""; 
    private _week: number; 
    
    private _tags: string[] = []; 

 

    constructor(offset?: number) {
        this._offset = (isNullOrUndefined(offset)) ? 0 : offset!; 
        this._week = -1; 
    }


    /**
     * Getter offset
     * @return {number }
     */
	public get offset(): number   {
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

    /**
     * Return the week of year
     */
    public get week(): number {
        return this._week;
    }
    public set week(value: number) {
        this._week = value;
    }


    public hasMemo(): boolean {
        return (this._text !== undefined) && this._text.length > 0; 
    }

    public hasWeek() : boolean {
        return (this._week >= 0);
    }

    public hasFlags(): boolean {
        let res = (this._flags !== undefined) && (this._flags.length > 0); 
        return res; 
    }

    public hasOffset(): boolean {
        return !isNaN(this.offset) && this._week === -1;  
    }

    public hasTask(): boolean {
        let matches: RegExpMatchArray | null  = this.flags.match("task|todo"); 
        return (matches !== null && matches.length > 0);
    }
	
    public hasText() {
		return this._text.length > 0; 
	}

    public generateDate(): Date {
        let date = new Date();
        date.setDate(date.getDate() + this.offset);
        return date; 

    }


    
}

export class NoteInput extends Input {

    private _path: string = ""; 

    constructor() {
        super(0); 
    }

    public get path() {return this._path;}
    public set path( path: string ) {this._path = path;}
    
}

export class SelectedInput extends Input {

    private _selected: boolean = false; // if selected from quickpick
    private _path: string = ""; 


    public get selected() {return this._selected;}
    public get path() {return this._path;}

    constructor(path: string) {
        super(0); 
        this._selected = true; 
        this._path = path; 
    }




}
