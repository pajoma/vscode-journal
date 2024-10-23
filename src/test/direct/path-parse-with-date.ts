import * as assert from 'assert';
import moment = require('moment');



const regExpDateFormats: RegExp = new RegExp(/\$\{(?:(year|month|day|localTime|localDate|weekday)|(d:[\s\S]+?))\}/g);
let base = "c:\\Users\\user\\Git\\vscode-journal\\test\\workspace\\journal";
let pathTpl = "${base}/${year}-${month}"; 
let fileTpl = "${year}${month}${day}.${ext}"; 
let uri = "file:/Users/user/Git/vscode-journal/test/workspace/journal/2020-07/20200709.md";

console.log("Test to acquire date from uri: ", uri); 
getDateFromURI(uri, pathTpl, fileTpl, base)
.then(result => assertCorrectDate(result)); 

pathTpl = "${year}/${month}/${day}"; 
fileTpl = "journal.${ext}"; 
uri = "file:/Users/user/Git/vscode-journal/test/workspace/journal/2020/07/09/journal.md";
console.log("Test to acquire date from uri: ", uri); 
getDateFromURI(uri, pathTpl, fileTpl, base)
.then(result => assertCorrectDate(result)); 


pathTpl = "${base}"; 
fileTpl = "${year}-${month}-${day}"; 
uri = "file:/Users/user/Git/vscode-journal/test/workspace/journal/2020-07-09.md";
console.log("Test to acquire date from uri: ", uri); 
getDateFromURI(uri, pathTpl, fileTpl, base)
.then(result => assertCorrectDate(result)); 

pathTpl = "${base}"; 
fileTpl = "${d:YYYY-MM-DD}"; 
uri = "file:/Users/user/Git/vscode-journal/test/workspace/journal/2020-07-09.md";
console.log("Test to acquire date from uri: ", uri); 
getDateFromURI(uri, pathTpl, fileTpl, base)
.then(result => assertCorrectDate(result)); 

export async function getDateFromURI(uri: string, pathTemplate: string, fileTemplate: string, basePath: string) {
    if(fileTemplate.indexOf(".") > 0) {fileTemplate = fileTemplate.substr(0, fileTemplate.lastIndexOf("."));} 
    if(pathTemplate.startsWith("${base}/")) {pathTemplate = pathTemplate.substring("${base}/".length);} 

    let year: number | undefined; 
    let month: number | undefined; 
    let day: number | undefined; 

    // input template is something like 
    //  "path": "${base}/${year}/${month}", -> sdlkjfwejf/2021/12
    //  "file": "${day}.${ext}"  -> 21.md
    //  but also file: ${year}-${month}-${day}.md


    // go through each element in path and assign it to a date part or skip it
    let pathParts = uri.split("/");


    // check if part is in base path (if yes, we ignore)
    // for the rest: last part is file, everything else path pattern
    let pathElements: string[] = [];
    let pathStr: string = ""; 
    let fileStr = ""; 

    pathParts.forEach((element, index) => {
        if(element.trim().length === 0) {return;} 
        else if(element.startsWith("file:")) {return;} 
        else if(basePath.search(element) >= 0) {return;} 
        else if(index+1 === pathParts.length) {fileStr = element.substr(0, element.lastIndexOf("."));}
        else {
            pathElements.concat(element);
            if(pathStr.length > 1) {pathStr += "/";}
            pathStr += element; 
        }
    });


    console.log(pathStr); 
    console.log(fileStr); 

    // ${base}/${year}/${month}-${day}/${LD}.${ext}
    // remove base and ext variables
    // tokenize in variables and loop through matches. 
    // replace each match with momemnt format and call moment.parse

    // path: 2021-08
    // file: 2021-08-12.md

    // handle path segment (we just compare indicies)
    /*
    pathTpl.split("/").forEach((element, index) => {
    
        if(element.match("")
    })*/
    let mom: moment.Moment = moment(fileStr, fileTemplate); 

    const entryMomentTpl = replaceDateTemplatesWithMomentsFormats(fileTemplate); 
    const pathMomentTpl = replaceDateTemplatesWithMomentsFormats(pathTemplate); 

    // filestr: "20210809"
    // path str: "/202108"
    // path tpl: ${year}-${month}"

    let a = moment(fileStr, entryMomentTpl); 
    let b = moment(pathStr, pathMomentTpl); 
    
    
    console.log("Parsed file string: ", a.format());
    console.log("Parsed path string: ", b.format());

    let result = moment(); 

    // consolidate the two
    if(fileTemplate.indexOf("${year}")>=0) {result = result.year(a.year());}
    else {result = result.year(b.year());}
    if(fileTemplate.indexOf("${month}")>=0) {result = result.month(a.month());}
    else {result = result.month(b.month());}
    if(fileTemplate.indexOf("${day}")>=0) {result = result.date(a.date());}
    else {result = result.date(b.date());}

    return result.toDate(); 

}



export function replaceDateTemplatesWithMomentsFormats(template: string): string {
    let matches: RegExpMatchArray | null = template.match(regExpDateFormats);
    if(matches === null) {
        return template; 
    }

    matches.forEach(match => {
        switch (match) {
            case "${year}":
                template = template.replace(match, "YYYY"); break;
            case "${month}":
                template = template.replace(match, "MM"); break;
            case "${day}":
                template = template.replace(match, "DD"); break;
            case "${localTime}":
                template = template.replace(match, "LT"); break;
            case "${localDate}":
                template = template.replace(match, "LL"); break;
            case "${weekday}":
                template = template.replace(match, "dddd"); break;
            default:
                // check if custom format
                if (match.startsWith("${d:")) {

                    let modifier = match.substring(match.indexOf("d:") + 2, match.length - 1); // includes } at the end
                    // st.template = st.template.replace(match, mom.format(modifier));
                    // fix for #51
                    template = template.replace(match, modifier);
                    break;
                }
                break;
        }
    });
    return template;

}

function assertCorrectDate(date: Date): void {
    let iso = date.toISOString(); 
    let result = iso.substring(0, iso.indexOf('T')); 
    console.log("Parsed result is: ", result); 
    assert.match(result, /2020-07-09/); 
}