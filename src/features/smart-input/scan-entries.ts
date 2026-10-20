import * as Path from 'path';
import { JournalPaths, JournalScopes, JournalSettings } from 'journal-core';
import { getJournalDate } from '../../shared/paths';
import { FileEntry, IFileSystem, ILogger, JournalPageType } from '../../shared/model/index';
import { SCOPE_DEFAULT } from '../../shared/config/configuration';
import { JournalFiles } from '../../shared/journal/journal-files';
import { JournalIndex } from '../../shared/journal/journal-index';

/** Receives scanned files. */
export type OnEntries = (entries: FileEntry[]) => void;

/** The scan of the journal the lists are built from. */
export type JournalScan = Pick<JournalIndex, 'get' | 'invalidate'>;

/**
 * The items of the smart input's lists and of the search: the files of the
 * journal's one scan (#320, {@link JournalIndex}: daily and weekly entries
 * of every layout, notes and attachments of every scope, classified as wiki
 * links and the calendar see them), with the dates the lists show and sort by.
 */
export class ScanEntries {

    private listed?: { files: JournalFiles; entries: Promise<FileEntry[]> };

    constructor(
        private readonly config: JournalSettings & JournalScopes & JournalPaths,
        private readonly logger: ILogger,
        private readonly fs: IFileSystem,
        /** Asked on first use: the index is created after the smart input. */
        private readonly scan: () => JournalScan,
    ) { }

    /** The next call scans the journal again, e.g. for files changed outside this window. */
    public clearCache(): void {
        this.scan().invalidate();
    }

    /** Every file of the journal: entries, weekly entries, notes, attachments. */
    public async getFiles(): Promise<FileEntry[]> {
        const files = await this.scan().get();
        if (this.listed?.files !== files) {
            this.listed = { files, entries: this.entries(files) };
        }
        return this.listed.entries;
    }

    /** The files of the type, newest first. */
    public async getPreviouslyAccessedFiles(type: JournalPageType, onEntries: OnEntries): Promise<void> {
        this.logger.trace("Entering getPreviouslyAccessedFiles() in smart-input/scan-entries.ts for type ", type);
        onEntries((await this.getFiles()).filter(fe => fe.type === type).sort(sortPickEntries));
    }

    /**
     * Each file with its type, scope and the day it belongs to (#300). The
     * stat calls run at the same time, so remote file systems do not pay a
     * round trip per file one after the other (#187).
     */
    private async entries(files: JournalFiles): Promise<FileEntry[]> {
        const found = [
            ...[...files.days.values()].map(path => ({ path, scope: SCOPE_DEFAULT, type: JournalPageType.entry })),
            ...[...files.weeks.values()].map(path => ({ path, scope: SCOPE_DEFAULT, type: JournalPageType.weekly })),
            ...files.notes.map(note => ({ path: note.path, scope: note.scope, type: JournalPageType.note })),
            ...files.attachments.map(file => ({ ...file, type: JournalPageType.attachment })),
        ];
        const entries = await Promise.all(found.map(async ({ path, scope, type }): Promise<FileEntry | undefined> => {
            try {
                const stat = await this.fs.stat(path);
                return {
                    path,
                    name: Path.basename(path),
                    scope,
                    type,
                    updateAt: stat.mtime,
                    accessedAt: stat.mtime,
                    createdAt: stat.ctime,
                    journalDate: getJournalDate(path, stat.ctime, scope, this.config).getTime(),
                };
            } catch {
                return undefined;
            }
        }));
        return entries.filter((fe): fe is FileEntry => fe !== undefined);
    }
}

/**
 * Newest first by the day a file belongs to (#300), not by its modification
 * time: a copied or cloned journal has the copy's modification times, and
 * editing an old note must not move it to the top (#279).
 */
export function sortPickEntries(a: FileEntry, b: FileEntry): number {
    return b.journalDate - a.journalDate || a.name.localeCompare(b.name);

}