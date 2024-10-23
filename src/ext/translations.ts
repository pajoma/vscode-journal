import * as vscode from 'vscode';
import * as J from '..';

import messages from './messages.json';

type Messages = {
    [locale: string]: {
      [category: string]: { 
        [code: string]: string;
      };
    };
  };



/**
 * Fetches a translation for the given category and code.
 * Falls back to English if the translation does not exist in the user's locale.
 * 
 * @param category - The translation category (e.g., "descriptions", "labels", "picks", "details").
 * @param code - The code that identifies the specific translation string.
 * @returns The translated string, or the English fallback if not found.
 */
function getTranslation(category: string, code: string): string {
    const translations: Messages = messages;
    const locale = vscode.env.language.substring(0, 2);  // Get the first two letters of the locale (e.g., "en", "de")

    // Attempt to retrieve the translation from the user's locale
    const translationCategory = translations[locale]?.[category] || translations['en']?.[category];  // Default to English if locale not found
    
    // Return the specific translation code from the user's locale or fallback to the English version
    return translationCategory[code] || translations['en'][category][code];
}

/**
 * Returns the description based on the code provided.
 * Always returns a fallback in English if no translation is found for the user's locale.
 * 
 * @param code - The code of the description string.
 * @returns The description string.
 */
export function getInputDetailsTranslation(code: number): string {
    return getTranslation('descriptions', code.toString());
}

/**
 * Returns the label based on the code provided.
 * Always returns a fallback in English if no translation is found for the user's locale.
 * 
 * @param code - The code of the label string.
 * @returns The label string.
 */
export function getInputLabelTranslation(code: number): string {
    return getTranslation('labels', code.toString());
}

/**
 * Returns the pick details based on the code provided.
 * Always returns a fallback in English if no translation is found for the user's locale.
 * 
 * @param code - The code of the pick details string.
 * @returns The pick details string.
 */
export function getPickDetailsTranslation(code: number): string {
    return getTranslation('picks', code.toString());
}

/**
 * Returns the task details string for a specific day.
 * Always returns a fallback in English if no translation is found for the user's locale.
 * 
 * @param dayAsString - The day string (e.g., "Monday", "Tuesday").
 * @returns The task details string.
 */
export function getInputDetailsStringForTask(dayAsString: string): string {
    const translation = getTranslation('details', 'task');
    return translation.replace("{day}", dayAsString);
}

/**
 * Returns the task details string for a specific week.
 * Always returns a fallback in English if no translation is found for the user's locale.
 * 
 * @param weekAsNumber - The week number (e.g., "32").
 * @returns The task details string for the specified week.
 */
export function getInputDetailsStringForTaskInWeek(weekAsNumber: number): string {
    const translation = getTranslation('details', 'taskInWeek');
    return translation.replace("{week}", weekAsNumber.toString());
}

/**
 * Returns the weekly details string for a specific week.
 * Always returns a fallback in English if no translation is found for the user's locale.
 * 
 * @param week - The week number.
 * @returns The weekly details string.
 */
export function getInputDetailsStringForWeekly(week: number): string {
    const translation = getTranslation('details', 'weekly');
    return translation.replace("{week}", week.toString());
}

/**
 * Returns the entry details string for a specific day.
 * Always returns a fallback in English if no translation is found for the user's locale.
 * 
 * @param dayAsString - The day string (e.g., "Monday", "Tuesday").
 * @returns The entry details string.
 */
export function getInputDetailsStringForEntry(dayAsString: string): string {
    const translation = getTranslation('details', 'entry');
    return translation.replace("{day}", dayAsString);
}

/**
 * Returns the memo details string for a specific day.
 * Always returns a fallback in English if no translation is found for the user's locale.
 * 
 * @param dayAsString - The day string (e.g., "Monday", "Tuesday").
 * @returns The memo details string.
 */
export function getInputDetailsStringForMemo(dayAsString: string): string {
    const translation = getTranslation('details', 'memo');
    return translation.replace("{day}", dayAsString);
}
