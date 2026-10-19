
import { JournalPageType } from './';

export interface FileEntry {
    path: string;
    name: string;
    scope?: string;
    updateAt: number;
    createdAt: number;
    accessedAt: number; 
    type?: JournalPageType;
    /** The day the file belongs to (ms), decided by the scanner when it finds the file; see getJournalDate in shared/paths. */
    journalDate: number;
}