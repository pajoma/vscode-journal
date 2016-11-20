'use strict';


export class Input {
    public offset: number = NaN; 
    public flags: string = ""; 
    public memo: string = ""; 

    public hasMemo(): boolean {
        return this.memo.length > 0; 
    }

    public hasFlags(): boolean {
        return this.flags.length > 0; 
    }

    public hasOffset(): boolean {
        return !isNaN(this.offset); 
    }

}