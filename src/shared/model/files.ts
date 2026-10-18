
import { JournalPageType } from './';

export interface FileEntry {
    path: string;
    name: string;
    scope?: string;
    updateAt: number;
    createdAt: number;
    accessedAt: number; 
    type?: JournalPageType;
    /** The day the file belongs to (ms), set by the scanner; see getJournalDate in shared/paths. */
    journalDate?: number;
}