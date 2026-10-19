import { ScopedTemplate } from 'journal-core';

export { EntryGranularity, HeaderTemplate, InlineTemplate, PatternDefinition, ScopeDefinition, ScopedTemplate, SCOPE_DEFAULT } from 'journal-core';

export enum JournalPageType {
    note,
    entry,
    attachment,
    /** a weekly entry: matches the weeks path pattern, neither a note nor a daily entry (#299) */
    weekly
}

export interface FilePattern extends ScopedTemplate {
    type: JournalPageType;
}

export interface PathTemplate extends ScopedTemplate {
    type: JournalPageType;
}

export type NavigationMode = 'existing' | 'calendar';
export type WeeklySyncConfig = {
    enabled: boolean;
    anchor: string;
    template: string;
    sortOrder: "ascending" | "descending";
};
export type InputDetailsTimeFormat = { sameDay: string; nextDay: string; nextWeek: string; lastDay: string; lastWeek: string; sameElse: string; };
