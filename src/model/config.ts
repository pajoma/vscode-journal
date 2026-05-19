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
export interface ScopeDefinitionLite { name?: string; base?: string; }
export type InputDetailsTimeFormat = { sameDay: string; nextDay: string; nextWeek: string; lastDay: string; lastWeek: string; sameElse: string; };

export const SCOPE_DEFAULT: string = "default";