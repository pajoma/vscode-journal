export enum JournalPageType {
    note,
    entry,
    attachment
}

export interface ScopedTemplate {
    name?: string;
    scope?: string;
    template: string;
    value?: string;
}



export interface FilePattern extends ScopedTemplate {
    type: JournalPageType;
}

export interface PathTemplate extends ScopedTemplate {
    type: JournalPageType;
}

export interface HeaderTemplate extends ScopedTemplate {
}

export interface InlineTemplate extends ScopedTemplate {
    after: string;
}

export type EntryGranularity = "daily" | "weekly";
export type NavigationMode = 'existing' | 'calendar';
export type WeeklySyncConfig = {
    enabled: boolean;
    anchor: string;
    template: string;
    sortOrder: "ascending" | "descending";
};
/** Shape of the `journal.patterns` setting. */
export type PatternDefinition = {
    notes: { path: string; file: string };
    entries: { path: string; file: string };
    weeks: { path: string; file: string };
    weeklyNotes?: { path: string; file: string };
};

/** Shape of a single entry in the `journal.scopes` setting. */
export type ScopeDefinition = {
    name: string;
    base?: string;
    patterns?: Partial<PatternDefinition>;
    templates?: InlineTemplate[];
};
export type InputDetailsTimeFormat = { sameDay: string; nextDay: string; nextWeek: string; lastDay: string; lastWeek: string; sameElse: string; };

export const SCOPE_DEFAULT: string = "default";