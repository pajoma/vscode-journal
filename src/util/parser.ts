'use strict';

import * as Q from 'q';
import * as journal from '.'; 

/**
 * Helper Methods to interpret the input strings
 */
export class Parser {

    constructor(public util:journal.Util) {

    }
 

    public split(value:string) : RegExpMatchArray {
        /* Groups (see https://regex101.com/r/sCtPOb/2)
            1: flag "task"
            2: shortcut "today"
            3: offset "+1"
            4: iso date "2012-12-23"
            5: month and day "12-23"
            6: day of month "23"
            7: weekday flag "next"
            8: weekday name "monday"
            9: flag "task" 
            10: text of memo
        */


        let flagsRX = "(?:(task|todo)\\s)"; 
        let shortcutRX = "(?:(today|tod|yesterday|yes|tomorrow|tom)\\s)"; 
        let offsetRX = "((?:\\+|\\-)\\d\\s)"
        // let isoDateRX = "(?:(\\d{4})\\-?(\\d{1,2})?\\-?(\\d{1,2})?\\s)"; 
        let isoDateRX = "(?:(\\d{4}\\-\\d{1,2}\\-\\d{1,2})|(\\d{1,2}\\-\\d{1,2})|(\\d{1,2})\\s)"
        let weekdayRX = "(?:(next|last|n|l)\\s(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\\s)";
        let remainder = "(.*)" 

        let completeExpression: string = "^"+flagsRX+"?(?:"+shortcutRX+"|"+offsetRX+"|"+isoDateRX+"|"+weekdayRX+")?"+flagsRX+"?(.*)"+"$"; 
        console.log(completeExpression);
        
        let regularExpression: RegExp = new RegExp(completeExpression); 

        return value.match(regularExpression);
    }

    /**
     * Takes a string and separates the flag, date and text
     */
    public tokenize(value:string) : Q.Promise<([string, string, string])> {
        var deferred: Q.Deferred<[string, string, string]> = Q.defer<[string, string, string]>();
        let time, flag, text = "";  

        let res: RegExpMatchArray  = this.split(value);  

        flag = (this.hasValue(res,1)) ? res[1] : res[9];     

        return deferred.promise; 
    }

    public getISO(values: string[]): number {

        return NaN; 
    }

    public getWeekday(values: string[]): number {

        return NaN; 
    }

    public getOffset(values: string[]): number {
        return NaN; 
    }


    private hasValue(array: string[], position: number) : boolean {
        return (array.length >= position) && array[position].length > 0;     
    }



    public resolveOffset(value:string) : Q.Promise<number> {
        let today:Date = new Date();

        let flags:string = "((task|todo)\s)?"; 
        let shortcuts:string = "(today|tod|yesterday|yes|tomorrow|tom)\s";  
        

        console.log("Resolving offset for \'", value, "\'");
        
        var deferred: Q.Deferred<number> = Q.defer<number>();

        /** shortcuts 
        let rema: RegExpMatchArray;
        let regexp : RegExp = new RegExp(flags); 

        if((rema = value.match(new RegExp("^(("+flags+")\s)?"))))

       // TODO: unclear how to dynamically construct regular expressions


        if((rema = value.match(/^(today|tod)(.*)/)).length > 0) {
            deferred.resolve([0, rema[2]]); 
        } else  if(value.match(/tomorrow|tom/)) {
            deferred.resolve([1, ""]); 
        } else if(value.match(/yesterday|yes/)) {
            deferred.resolve([-1, ""]); 
        }
        */
        /** offset */
        if(value.startsWith("+", 0)) {
            let match:string[] = value.match(/^\+\d+$/); 
            if(match.length == 1) { 
                let parsedOffset:number = parseInt(match[0].substring(1, match[0].length)); 
                deferred.resolve(parsedOffset);
            } else {
                deferred.reject("Invalid number for positive offset"); 
            }
        }

        else if(value.startsWith("-", 0)) {
            let match:string[] = value.match(/^\-\d+$/); 
            if(match.length == 1) {
                let parsedOffset:number = parseInt(match[0].substring(1, match[0].length)) * -1;
                deferred.resolve(parsedOffset);
            } else {
                deferred.reject("Invalid number for positive offset"); 
            }
        }  

        /** weekday (last wednesday, next monday) */
        else if(value.match(/^(next|last).*/)) {
            let tokens:string[] = value.split(" ");
            if(tokens.length <= 1) deferred.reject("Malformed input"); 

            // get name of weekday in input
            let searchedDay = this.util.getDayOfWeekForString(tokens[1]); 
            let currentDay:number = today.getDay();    

            // toggle mode (next or last)
            let next = (tokens[0].charAt(0)=='n') ? true : false; 

            let diff = searchedDay - currentDay; 

            //   today is wednesday (currentDay = 3)
            // 'last monday' (default day of week: 1)
            if(!next && diff < 0)  {
                // diff = -2 (offset)         
                deferred.resolve(diff);

            // 'last friday' (default day of week: 5)
            } else if(!next && diff >= 0)  {
                // diff = 2; 2-7 = -5 (= offset)
                deferred.resolve(diff-7);

            // 'next monday' (default day of week: 1)
            } else if(next && diff <= 0)  {
                // diff = -2, 7-2 = 5 (offset)
                deferred.resolve(diff+7);

            // 'next friday' (default day of week: 5)
            } else if(next && diff > 0)  {
                // diff = 2 (offset)
                deferred.resolve(diff);
            } 
        }

        /** starts with an at least one digit , we assume it is a date */
        else if(value.match(/^\d{1,4}.*/)) {
            let todayInMS:number = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());

            let dt:string[] = value.split("-");
         
            
            let year:number, month:number, day:number; 
            if(dt.length >= 3) {
                year = parseInt(dt[0]); 
                month = parseInt(dt[1])-1;
                day = parseInt(dt[2]);
            } else if(dt.length >= 2) {
                month = parseInt(dt[0])-1;
                day= parseInt(dt[1]);
            } else {
                day = parseInt(dt[0]); 
            }  
            
            if(month && (month < 0 || month > 12)) deferred.reject("Invalid value for month"); 
            if(day && (day < 0 || day > 31)) deferred.reject("Invalid value for day");


            let inputInMS:number = 0;
            if(year) {
                // full date with year (e.g. 2016-10-24)
                inputInMS = Date.UTC(parseInt(dt[0]), parseInt(dt[1])-1, parseInt(dt[2]));
            } else if(month) { 
                // month and day (eg. 10-24)
               
                 inputInMS = Date.UTC(today.getFullYear(), parseInt(dt[0])-1, parseInt(dt[1]));
            } else if(day) { 
                // just a day
                inputInMS = Date.UTC(today.getFullYear(), today.getMonth(), parseInt(dt[0]));
            } else {
                deferred.reject("Failed to parse the date"); 
            }
            
            let result:number = Math.floor((inputInMS - todayInMS) / (1000 * 60 * 60 * 24)); 
            deferred.resolve(result);


            // // full date with year (e.g. 2016-10-24) 
            // if(value.match(/^(\d{4})-0?(\d{0,2})-0?(\d{0,2})$/)) {
            //     let dt: string[] = value.split("-");
            //     let inputInMS:number = Date.UTC(parseInt(dt[0]), parseInt(dt[1])-1, parseInt(dt[2]));
            //     deferred.resolve(Math.floor((inputInMS - todayInMS) / (1000 * 60 * 60 * 24)));
            
            // // month and day (eg. 10-24)
            // } else if(value.match(/^0?(\d{0,2})-0?(\d{0,2})$/)) { 
            //     let dt: string[] = value.split("-");
            //     let inputInMS:number = Date.UTC(today.getFullYear(), parseInt(dt[0])-1, parseInt(dt[1]));
            //     deferred.resolve(Math.floor((inputInMS - todayInMS) / (1000 * 60 * 60 * 24)));
            // // just a day
            //  } else if(value.match(/^0?(\d{0,2})$/)) { 
            //     let inputInMS:number = Date.UTC(today.getFullYear(), today.getMonth(), parseInt(value));
            //     let offset = Math.floor((inputInMS - todayInMS) / (1000 * 60 * 60 * 24)); 
            //     deferred.resolve(offset);
            // }

        }  
         
        else {
            deferred.reject("Failed to infer a date from the value \""+value+"\""); 
        }


        return deferred.promise; 
    }


}

