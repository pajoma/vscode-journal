import * as J from '..';

import * as vscode from 'vscode';

const descTranslations: Map<string, string> = new Map();
const labelTranslations: Map<string, string> = new Map();
const pickTranslations: Map<string, string> = new Map();

export function getInputDetailsTranslation(code: number): string | undefined {
    if (descTranslations.size === 0) {
        descTranslations.set("en" + 1, "Jump to today's entry.");
        descTranslations.set("en" + 2, "Jump to tomorrow's entry.");
        descTranslations.set("en" + 3, "Select from the last journal entries.");
        descTranslations.set("en" + 4, "Create a new note or select from recently created or updated notes.");
        descTranslations.set("en" + 5, "Select from the list of recently added attachements.");

        descTranslations.set("de" + 1, "Zum Eintrag für heute wechseln.");
        descTranslations.set("de" + 2, "Zum Eintrag für morgen wechseln.");
        descTranslations.set("de" + 3, "Wählen Sie aus den letzten Journaleinträgen aus. ");
        descTranslations.set("de" + 4, "Erstellen Sie eine neue Notiz oder wählen Sie aus den letzten Notizen aus.");
        descTranslations.set("de" + 5, "Wählen Sie aus der Liste der zuletzt hinzugefügten Anlagen aus.");

        descTranslations.set("fr" + 1, "Aller à l'entrée d'aujourd'hui.");
        descTranslations.set("fr" + 2, "Sautez à l'entrée de demain.");
        descTranslations.set("fr" + 3, "Sélectionnez l'une des dernières entrées.");
        descTranslations.set("fr" + 4, "Créez une nouvelle note ou sélectionnez une note parmi les notes récemment créées ou mises à jour.");
        descTranslations.set("fr" + 5, "Sélectionnez dans la liste des pièces jointes récemment ajoutées");

        descTranslations.set("es" + 1, "Saltar a la entrada de hoy.");
        descTranslations.set("es" + 2, "Salta a la entrada de mañana.");
        descTranslations.set("es" + 3, "Seleccione una de las últimas entradas. ");
        descTranslations.set("es" + 4, "Cree una nueva nota o seleccione una de las notas creadas o actualizadas recientemente.");
        descTranslations.set("es" + 5, "Seleccione de la lista de archivos adjuntos añadidos recientemente");
    }
    let val = descTranslations.get(getLocale().substring(0, 2) + code);
    if (J.Util.isNullOrUndefined(val)) { val = labelTranslations.get("en" + code); }
    return <string>val;
}


export function getLocale(conf?: J.Extension.Configuration) {
    if (conf) { return conf.getLocale(); }
    else { return vscode.env.language; }
}


/**
 * Generates the details for the QuickPick Box (when creating a task)
 * 
 * FIXME: Externalize to properties
 * @param dayAsString 
 */
export function getInputDetailsStringForTask(dayAsString: string): string {
    if (getLocale().startsWith("en")) {
        return `Add task to entry ${dayAsString}`;
    } else if (getLocale().startsWith("de")) {
        return `Aufgabe zum Eintrag ${dayAsString} hinzufügen`;
    } else if (getLocale().startsWith("fr")) {
        return `Ajouter une tâche à l'entrée du ${dayAsString}`;
    } else if (getLocale().startsWith("es")) {
        return `Añadir tarea a la entrada del ${dayAsString}`;
    } else {
        return `Add task to entry ${dayAsString}`;
    }
}


/**
* Generates the details for the QuickPick Box (when creating a task)
* 
* FIXME: Externalize to properties
* @param dayAsString 
*/
export function getInputDetailsStringForTaskInWeek(weekAsNumber: Number): string {
    if (getLocale().startsWith("en")) {
        return `Add task to entry for week ${weekAsNumber}`;
    } else if (getLocale().startsWith("de")) {
        return `Aufgabe zum Eintrag für Woche ${weekAsNumber} hinzufügen`;
    } else if (getLocale().startsWith("fr")) {
        return `Ajouter une tâche à l'entrée de la semaine ${weekAsNumber}`;
    } else if (getLocale().startsWith("es")) {
        return `Añadir tarea a la entrada de la semana ${weekAsNumber}`;
    } else {
        return `Add task to entry ${weekAsNumber}`;
    }
}


/**
* Generates the details for the QuickPick Box (when opening a weekly)
* 
* FIXME: Externalize to properties
* @param dayAsString 
*/
export function getInputDetailsStringForWeekly(week: Number): string {
    if (getLocale().startsWith("en")) {
        return `Open notes for week ${week}`;
    } else if (getLocale().startsWith("de")) {
        return `Notizen für Kalenderwoche ${week} öffnen`;
    } else if (getLocale().startsWith("fr")) {
        return `Ouvrir l'inscription pour la semaine ${week}`;
    } else if (getLocale().startsWith("es")) {
        return `Entrada abierta para la semana ${week}`;
    } else {
        return `Add task to entry ${week}`;
    }
}

export function getInputDetailsStringForEntry(dayAsString: string) {
    if (getLocale().startsWith("en")) {
        return `Create or open entry ${dayAsString}`;
    } else if (getLocale().startsWith("de")) {
        return `Eintrag ${dayAsString} erstellen oder öffnen`;
    } else if (getLocale().startsWith("fr")) {
        return `Créer ou ouvrir une entrée ${dayAsString}`;
    } else if (getLocale().startsWith("es")) {
        return `Crear o abrir una entrada  ${dayAsString}`;
    } else {
        return `Create or open entry ${dayAsString}`;
    }
}


/**
 * Generates the details for the QuickPick Box (when creating a task)
 * 
 * FIXME: Externalize to properties
 * @param dayAsString 
 */
export function getInputDetailsStringForMemo(dayAsString: string) {
    if (getLocale().startsWith("en")) {
        return `Add memo to entry ${dayAsString}`;
    } else if (getLocale().startsWith("de")) {
        return `Memo zum Eintrag ${dayAsString} hinzufügen`;
    } else if (getLocale().startsWith("fr")) {
        return `Ajouter un mémo à l'entrée ${dayAsString}`;
    } else if (getLocale().startsWith("es")) {
        return `Agregar un memo a la entrada ${dayAsString}`;
    } else {
        return `Add memo to entry ${dayAsString}`;
    }
}



export function getInputLabelTranslation(code: number) {
    if (labelTranslations.size === 0) {
        labelTranslations.set("en" + 1, "Today");
        labelTranslations.set("en" + 2, "Tomorrow");
        labelTranslations.set("en" + 3, "Select entry");
        labelTranslations.set("en" + 4, "Select/Create a note");
        labelTranslations.set("en" + 5, "Select attachement");

        labelTranslations.set("de" + 1, "Heute");
        labelTranslations.set("de" + 2, "Morgen");
        labelTranslations.set("de" + 3, "Eintrag auswählen");
        labelTranslations.set("de" + 4, "Notiz auswählen oder erstellen");
        labelTranslations.set("de" + 5, "Anhang auswählen");

        labelTranslations.set("es" + 1, "Hoy");
        labelTranslations.set("es" + 2, "Mañana ");
        labelTranslations.set("es" + 3, "Seleccionar entrada");
        labelTranslations.set("es" + 4, "Seleccionar o crear nota");
        labelTranslations.set("es" + 5, "Seleccionar adjunto");


        labelTranslations.set("fr" + 1, "Aujourd'hui");
        labelTranslations.set("fr" + 2, "Demain");
        labelTranslations.set("fr" + 3, "Sélectionner une entrée");
        labelTranslations.set("fr" + 4, "Sélectionner ou créer une note");
        labelTranslations.set("fr" + 5, "Sélectionner la pièce jointe");
    }
    let val = labelTranslations.get(getLocale().substring(0, 2) + code);
    if (J.Util.isNullOrUndefined(val)) { val = labelTranslations.get("en" + code); }

    return <string>val;

}




export function getPickDetailsTranslation(code: number): string | undefined {
    if (pickTranslations.size === 0) {
        pickTranslations.set("en" + 1, "[from] ll");
        pickTranslations.set("en" + 2, "[from] dddd");
        pickTranslations.set("de" + 1, "[von] ll");
        pickTranslations.set("de" + 2, "[vom] dddd");
        pickTranslations.set("fr" + 1, "[du] ll");
        pickTranslations.set("fr" + 2, "[du] dddd");
        pickTranslations.set("es" + 1, "[desde] el");
        pickTranslations.set("es" + 2, "[del] dddd");
    }
    let val = pickTranslations.get(getLocale().substring(0, 2) + code);
    if (J.Util.isNullOrUndefined(val)) { val = pickTranslations.get("en" + code); }
    return <string>val;

}