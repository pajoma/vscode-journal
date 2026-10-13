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

import { firstDayOfWeek } from 'journal-core';
import { isNullOrUndefined } from '../lang';
import { SCOPE_DEFAULT } from './config';

export type ParseConfidence = 'resolved' | 'ambiguous' | 'text-only';

/**
 * What a smart input does: open an entry, add a memo or a task to it, open a
 * note, or open a file picked in the quick pick (#280). Code that acts on an
 * input switches on it exhaustively, so a new kind is reported by the compiler.
 */
export type InputKind = 'entry' | 'memo' | 'task' | 'note' | 'selected';

export class Input {



    private _offset: number;
    /** Set by the parser for entries ('entry', 'memo', 'task'); notes and picked files set their own. */
    public kind: InputKind = 'entry';
    /** The file of a note or a picked file; empty for entries (resolved by the reader). */
    public path: string = "";
    protected _text: string = "";
    protected _scope: string = SCOPE_DEFAULT;
    private _week: number;
    private _weekYear: number = -1;
    private _date: Date | undefined;
    public confidence: ParseConfidence | undefined;

    protected _tags: string[] = [];

 

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
     * Getter date
     */
    public get date(): Date | undefined {
        return this._date;
    }

    /**
     * Setter offset
     * @param {number } value
     */
	public set offset(value: number ) {
		this._offset = value;
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
     * Setter date
     */
    public set date(value: Date | undefined) {
        this._date = value;
    }

    /**
     * Return the week of year
     */
    public get week(): number {
        return this._week;
    }

    /**
     * The year the week belongs to (in the journal locale). Around New Year it
     * is not the calendar year: 2027-01-03 is week 53 of 2026 in German (#250).
     */
    public get weekYear(): number {
        return this._weekYear;
    }

    /** Sets the week together with its year, since a week number alone is ambiguous. */
    public setWeek(week: number, year: number): void {
        this._week = week;
        this._weekYear = year;
    }


    /** Adds a memo to the entry. */
    public hasMemo(): boolean {
        return this.kind === 'memo';
    }

    public hasWeek() : boolean {
        return (this._week >= 0);
    }

    public hasOffset(): boolean {
        return (this.date !== undefined) || (!isNaN(this.offset) && this._week === -1);  
    }

    /** Adds a task to the entry. */
    public hasTask(): boolean {
        return this.kind === 'task';
    }
	
    public hasText() {
		return this._text.length > 0; 
	}

    public generateDate(): Date {
        if (this.date) {
            return this.date;
        }
        let date = new Date();
        date.setDate(date.getDate() + this.offset);
        return date;
    }

    /** The day the input stands for: for a week its first day, in the journal locale (#149). */
    public anchorDate(locale: string): Date {
        return this.hasWeek() ? firstDayOfWeek(this._week, this._weekYear, locale) : this.generateDate();
    }

    /** The entry this input belongs to: its day or week, without text, scope or tags. */
    public entryTarget(): Input {
        const target = new Input(this.offset);
        target.date = this.date;
        if (this.hasWeek()) { target.setWeek(this._week, this._weekYear); }
        return target;
    }

    public extractScopeAndTags(availableScopes: string[]): void {
        this._text.match(/#[\w-]+(?:\s|$)/g)?.forEach(match => {
            const tag = match.trim();
            this._tags.push(tag);
            this._text = this._text.replace(match, " ");
            const scopeName = tag.substring(1);
            const matched = availableScopes.find(name => name === scopeName);
            if (matched) { this._scope = matched; }
        });
    }
}

/** A note for today. Code that loads notes takes any Input of kind 'note'. */
export class NoteInput extends Input {

    constructor() {
        super(0);
        this.kind = 'note';
    }
}

/** A file picked in the quick pick: it is opened as it is. */
export class SelectedInput extends Input {

    constructor(path: string) {
        super(0);
        this.kind = 'selected';
        this.path = path;
    }
}
