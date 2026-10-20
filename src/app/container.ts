// Copyright (C) 2018  Patrick Maué
//
// This file is part of vscode-journal.
//
// vscode-journal is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// vscode-journal is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with vscode-journal.  If not, see <http://www.gnu.org/licenses/>.
//

'use strict';

import * as vscode from 'vscode';
import { HostEnvironment, IConfiguration, IFileSystem, ILogger, IWorkspaceConfigReader, JournalController } from '../shared/model/index';
import { Configuration } from '../shared/config/configuration';
import { Parser } from '../features/smart-input/parser';
import { Writer } from '../features/entries/writer';
import { Reader } from '../features/entries/reader';
import { Inject } from '../features/entries/inject';
import { Dialogues } from '../features/smart-input/dialogues';
import { VscodeEditor } from '../shared/editor/vscode-editor';
import { VscodeFileSystem } from '../shared/fs/vscode-fs';
import { JournalEvents } from '../shared/events';
import { getWeekFromPath } from '../shared/paths';
import { SyncDailyLinks } from '../features/weekly/sync-daily-links';
import { SyncNoteLinks } from '../features/notes/sync-note-links';
import { Notes } from '../features/notes/load-note';
import { JournalIndex } from '../shared/journal/journal-index';
import { PageTexts } from '../shared/journal/page-texts';

/**
 * Builds the logger once the configuration is available. The logger needs the
 * configuration (for trace/dev settings), so the container resolves the config
 * first and then hands it to this factory — single-pass, no two-phase init.
 */
export type LoggerFactory = (config: IConfiguration) => ILogger;

/** UI language and workspace root, read from VS Code on every use. */
export const VSCODE_HOST: HostEnvironment = {
    language: vscode.env.language,
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
};

/**
 * Composition root. Constructs the full service graph in one pass and exposes
 * it through the {@link JournalController} interface. Consumers depend on the
 * interface, never on this concrete class — only the registration layer
 * (`app/`) instantiates it.
 */
export class Container implements JournalController {

    public readonly config: Configuration;
    public readonly logger: ILogger;
    public readonly fs: IFileSystem;
    public readonly inject: Inject;
    public readonly parser: Parser;
    public readonly ui: Dialogues;
    public readonly editor: VscodeEditor;
    public readonly writer: Writer;
    public readonly reader: Reader;
    public readonly events: JournalEvents;
    /** One instance, so all note-link updates are serialized. */
    public readonly noteLinks: SyncNoteLinks;
    public readonly notes: Notes;
    /** The texts of the journal's files, read once per modification (#320). */
    public readonly texts: PageTexts;
    private journalIndex?: JournalIndex;

    constructor(configSource: IWorkspaceConfigReader, loggerFactory: LoggerFactory) {
        this.config = new Configuration(configSource, VSCODE_HOST);
        this.logger = loggerFactory(this.config);
        this.fs = new VscodeFileSystem();
        this.editor = new VscodeEditor(this.config, this.logger);
        this.inject = new Inject(this.config, this.logger, this.editor);
        this.parser = new Parser(this.config, this.logger);
        this.texts = new PageTexts(this.fs);
        this.ui = new Dialogues(this.config, this.logger, this.parser, this.fs, this.texts, () => this.index);
        this.writer = new Writer(this.config, this.logger, this.fs);
        this.reader = new Reader(this.config, this.logger, this.writer, this.fs);
        this.events = new JournalEvents();
        this.noteLinks = new SyncNoteLinks(this);
        this.notes = new Notes(this);

        // Cross-feature: when an entry opens, the weekly feature refreshes its
        // daily-entry links. Wired here (composition root) so the entries
        // feature need not import the weekly feature.
        this.events.onEntryOpened(({ path }) => this.syncWeeklyOnEntryOpened(path));
        // A new note is linked from the day's entry when it is created, in every scope (#279).
        this.events.onNoteCreated(({ path, entry }) => {
            this.noteLinks.linkNotes(entry, [path])
                .catch(err => this.logger.error("Failed to link new note.", err));
        });
    }

    /**
     * The journal's one scan (#320): days, weeks, notes and attachments for the
     * smart input, the search, wiki links and the calendar. Created on first
     * use (it watches the journal folder); whoever starts the extension
     * disposes it.
     */
    public get index(): JournalIndex {
        this.journalIndex ??= new JournalIndex(this, this.texts);
        return this.journalIndex;
    }

    private syncWeeklyOnEntryOpened(path: string): void {
        // Fire-and-forget — must never reject the open flow.
        const weekInfo = getWeekFromPath(path, this.config);
        if (weekInfo && this.config.getWeeklySyncConfig().enabled) {
            const scopeId = weekInfo.scope === 'default' ? undefined : weekInfo.scope;
            new SyncDailyLinks(this)
                .sync(path, weekInfo.week, weekInfo.year, scopeId)
                .catch(err => this.logger.error("entryOpened weekly sync failed:", err));
        }
    }
}
