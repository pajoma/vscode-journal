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
/** The journal search (#300), `journal.search.*`. */
export type SearchSettings = {
    /** The search row in the smart input, the search command and the index. */
    enabled: boolean;
    /** Build the index after startup: `local` not in remote sessions. */
    indexOnStartup: 'local' | 'always' | 'never';
    /** Search the text of the files, not only their titles. */
    content: boolean;
    /** How much newer files are preferred among similar matches. */
    recency: 'off' | 'low' | 'default' | 'high';
    maxResults: number;
};
export const SEARCH_DEFAULTS: SearchSettings = { enabled: true, indexOnStartup: 'local', content: true, recency: 'default', maxResults: 100 };
export type InputDetailsTimeFormat = { sameDay: string; nextDay: string; nextWeek: string; lastDay: string; lastWeek: string; sameElse: string; };
