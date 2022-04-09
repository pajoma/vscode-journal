import * as vscode from 'vscode';
import * as J from '..';
import moment = require("moment");

/**
 * Feature responsible for printing the duration between two selected times (useful for time tracking)
 */
export class TimeTrackerTools {

    constructor(public ctrl: J.Util.Ctrl) {}

    public printTime(): Promise<string> {
        return new Promise<string>((resolve, reject) => {

            this.ctrl.logger.trace("Entering printTime() in ext/commands.ts");

            let editor: vscode.TextEditor = <vscode.TextEditor>vscode.window.activeTextEditor;

            // Todo: identify scope of the active editor
            this.ctrl.config.getTimeStringTemplate()
                .then(tpl => {
                    let currentPosition: vscode.Position = editor.selection.active;
                    this.ctrl.inject.injectString(editor.document, tpl.value!, currentPosition);
                    resolve(tpl.value!);
                })
                .catch(error => reject(error));

        });
    }

    public printDuration(): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            this.ctrl.logger.trace("Entering printDuration() in ext/commands.ts");

            try {
                let editor: vscode.TextEditor = <vscode.TextEditor>vscode.window.activeTextEditor;
                let regExp: RegExp = /\d{1,2}:?\d{0,2}(?:\s?(?:am|AM|pm|PM))?|\s/;
                // let regExp: RegExp = /(\d{1,2}:?\d{2}\s)|(\d{1,4}\s?(?:am|pm)\s)|(\d{1,2}[,\.]\d{1,2}\s)|(\s)/;

                if (editor.selections.length !== 3) {
                    throw new Error("To compute the duration, you have to select two times in your text as well as the location where to print it. ");
                }

                // 
                let start: moment.Moment | undefined;
                let end: moment.Moment | undefined;
                let target: vscode.Position | undefined;


                editor.selections.forEach((selection: vscode.Selection) => {
                    let range: vscode.Range | undefined = editor.document.getWordRangeAtPosition(selection.active, regExp);


                    if (J.Util.isNullOrUndefined(range)) {
                        target = selection.active;
                        return;
                    }

                    let text = editor.document.getText(range);

                    // check if empty string
                    if (text.trim().length === 0) {
                        target = selection.active;
                        return;
                    }

                    // try to format into local date
                    let time: moment.Moment = moment(text, "LT");

                    if (!time.isValid()) {
                        // 123pm
                        let mod: number = text.search(/am|pm/);
                        if (mod > 0) {
                            if (text.charAt(mod - 1) !== " ") {
                                text = text.substr(0, mod - 1) + " " + text.substr(mod);
                            }
                            time = moment(text, "hmm a");
                        }
                    }

                    if (!time.isValid()) {
                        // 123AM
                        let mod: number = text.search(/AM|PM/);
                        if (mod > 0) {
                            if (text.charAt(mod - 1) !== " ") {
                                text = text.substr(0, mod - 1) + " " + text.substr(mod);
                            }
                            time = moment(text, "hmm A");
                        }
                    }

                    if (!time.isValid()) {
                        // 2330
                        time = moment(text, "Hmm");
                    }

                    // parsing glued hours



                    if (J.Util.isNullOrUndefined(start)) {
                        start = time;
                    } else if (start!.isAfter(time)) {
                        end = start;
                        start = time;
                    } else {
                        end = time;
                    }
                });

                if (J.Util.isNullOrUndefined(start)) { reject("No valid start time selected"); }  // tslint:disable-line
                else if (J.Util.isNullOrUndefined(end)) { reject("No valid end time selected"); }  // tslint:disable-line
                else if (J.Util.isNullOrUndefined(target)) { reject("No valid target selected for printing the duration."); }  // tslint:disable-line  
                else {
                    let duration = moment.duration(start!.diff(end!));
                    let formattedDuration = Math.abs(duration.asHours()).toFixed(2);


                    this.ctrl.inject.injectString(editor.document, formattedDuration, target!);
                    resolve(formattedDuration);
                }





            } catch (error) {
                reject(error);
            }


        });
    }


    public printSum(): Promise<string> {

        return new Promise<string>((resolve, reject) => {
            this.ctrl.logger.trace("Entering printSum() in ext/commands.ts");

            let editor: vscode.TextEditor = <vscode.TextEditor>vscode.window.activeTextEditor;
            let regExp: RegExp = /(\d+[,\.]?\d*\s?)|(\s)/;

            let target: vscode.Position;
            let numbers: number[] = [];

            editor.selections.forEach((selection: vscode.Selection) => {
                let range: vscode.Range | undefined = editor.document.getWordRangeAtPosition(selection.active, regExp);

                if (J.Util.isNullOrUndefined(range)) {
                    target = selection.active;
                    return;
                }

                let text = editor.document.getText(range);

                // check if empty string
                if (text.trim().length === 0) {
                    target = selection.active;

                    return;
                }
                // check if number
                let number: number = Number(text);
                if (number > 0) {
                    numbers.push(number);
                    return;
                }

            });

            if (numbers.length < 2) { reject("You have to select at least two numbers"); }  // tslint:disable-line
            else if (J.Util.isNullOrUndefined(target!)) { reject("No valid target selected for printing the sum."); }  // tslint:disable-line  
            else {
                let result: string = numbers.reduce((previous, current) => previous + current).toString();


                this.ctrl.inject.injectString(editor.document, result + "", target!);
                resolve(result);
            }
        });
    }
}