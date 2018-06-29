'use strict';

import { isUndefined } from "util";

export default class Input {

  
    private _offset: number; 
    private _flags: string = ""; 
    private _text: string = ""; 
    private _scope: string = "default"; 

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