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
import { Container, VSCODE_HOST } from './container';
import { OpenJournalWorkspaceCommand } from '../features/tools/commands/open-journal-workspace';
import { PrintTimeCommand } from '../features/tools/commands/print-current-time';
import { PrintDurationCommand } from '../features/tools/commands/print-duration-between-selected-times';
import { PrintSumCommand } from '../features/tools/commands/print-sum-of-selected-numbers';
import { CopyTaskCommand as ShiftTaskCommand } from '../features/tasks/commands/copy-task';
import { OpenNextEntryCommand } from '../features/navigation/commands/open-next-entry';
import { OpenPreviousEntryCommand } from '../features/navigation/commands/open-previous-entry';
import { ShowEntryForInputCommand } from '../features/entries/commands/show-entry-for-input';
import { SearchJournalCommand } from '../features/entries/commands/search-journal';
import { buildsIndexOnStartup } from '../features/smart-input/search-index';
import { ShowEntryForTodayCommand } from '../features/entries/commands/show-entry-for-today';
import { ShowEntryForTomorrowCommand } from '../features/entries/commands/show-entry-for-tomorrow';
import { ShowEntryForYesterdayCommand } from '../features/entries/commands/show-entry-for-yesterday';
import { ShowNoteCommand } from '../features/notes/commands/show-note';
import { CreateScopeCommand } from '../features/scopes/commands/create-scope';
import { MigrateLayoutCommand } from '../features/layouts/commands/migrate-layout';
import { OpenCalendarCommand } from '../features/calendar/commands/open-calendar';
import { OpenDayCommand } from '../features/calendar/commands/open-day';
import { OpenWeekCommand } from '../features/calendar/commands/open-week';
import { NavigationLensProvider, PICK_BACKLINK, pickBacklink } from '../features/calendar/navigation-lens';
import { LayoutWatcher } from '../features/layouts/layout-watcher';
import { OpenWikiLinkCommand } from '../features/wikilinks/commands/open-wiki-link';
import { previewResolver } from '../features/wikilinks/preview-resolver';
import { timed } from '../shared/logging/timing';
import { wikiLinkPlugin } from '../features/wikilinks/markdown-plugin';
import { WikiCompletionProvider } from '../features/wikilinks/wiki-completion';
import { JournalIndex } from '../shared/journal/journal-index';
import { WikiLinkProvider } from '../features/wikilinks/wiki-link-provider';
import { watchScopeFolders } from '../features/scopes/scope-folders';
import { WeeklyEntryWatcher } from '../features/weekly/weekly-entry-watcher';
import { SyncDailyLinks } from '../features/weekly/sync-daily-links';
import { CompletedTaskActions } from '../features/tasks/codeactions/for-completed-tasks';
import { OpenTaskActions } from '../features/tasks/codeactions/for-open-tasks';
import { manifestKeys, McpFiles, McpLocations, registerMcpServer } from '../features/mcp/mcp-server';
import { SetupMcpCommand } from '../features/mcp/commands/setup-mcp';
import { isRemoteSession } from '../shared/editor/remote-session';

const MARKDOWN_SELECTOR: vscode.DocumentSelector = { scheme: 'file', language: 'markdown' };

/** Registers all journal commands and the weekly/note sync wiring. */
export function registerCommands(ctrl: Container, context: vscode.ExtensionContext): void {
    ctrl.logger.trace("Entering registerCommands() in app/register.ts");

    ctrl.reader.onNotesInjected = (path, date) => {
        timed(ctrl.logger, 'link the notes of the day (after loading an entry)', () => ctrl.noteLinks.injectAttachmentLinks(path, date))
            .catch(err => ctrl.logger.error("Failed to link the notes of the day.", err))
            .finally(() => ctrl.logger.trace("Scanning notes completed"));
    };

    context.subscriptions.push(watchScopeFolders(ctrl));

    const syncDailyLinks = new SyncDailyLinks(ctrl);
    context.subscriptions.push(new WeeklyEntryWatcher(ctrl, syncDailyLinks));
    context.subscriptions.push(new LayoutWatcher(ctrl));

    context.subscriptions.push(
        OpenJournalWorkspaceCommand.create(ctrl),
        PrintTimeCommand.create(ctrl),
        PrintSumCommand.create(ctrl),
        PrintDurationCommand.create(ctrl),
        ShowEntryForInputCommand.create(ctrl),
        vscode.commands.registerCommand('journal.memo', () =>
            new ShowEntryForInputCommand(ctrl).execute()),
        ShowEntryForTodayCommand.create(ctrl),
        ShowEntryForTomorrowCommand.create(ctrl),
        ShowEntryForYesterdayCommand.create(ctrl),
        ShowNoteCommand.create(ctrl),
        SearchJournalCommand.create(ctrl),
        CreateScopeCommand.create(ctrl),
        MigrateLayoutCommand.create(ctrl),
        ShiftTaskCommand.create(ctrl),
        OpenPreviousEntryCommand.create(ctrl),
        OpenNextEntryCommand.create(ctrl),
    );
}

/**
 * The bundled MCP server (#292): registered for Copilot, and the files and
 * the setup command for other clients.
 */
export function registerMcp(ctrl: Container, context: vscode.ExtensionContext): void {
    const locations: McpLocations = {
        bundledServer: vscode.Uri.joinPath(context.extensionUri, 'dist', 'mcp-server.mjs').fsPath,
        globalStorage: context.globalStorageUri.fsPath,
        workspaceStorage: context.storageUri?.fsPath,
    };
    const files = new McpFiles(locations, manifestKeys(context.extension.packageJSON), VSCODE_HOST);
    context.subscriptions.push(
        registerMcpServer(files, context.extension.packageJSON.version,
            (msg, err) => ctrl.logger.error(msg, err)),
        SetupMcpCommand.create(ctrl, files),
    );
}

/** Registers the markdown code-action providers (task state transitions). */
export function registerCodeActions(ctrl: Container, context: vscode.ExtensionContext): void {
    // TODO: add filters only for configured base directories
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(MARKDOWN_SELECTOR, new CompletedTaskActions(ctrl)),
        vscode.languages.registerCodeActionsProvider(MARKDOWN_SELECTOR, new OpenTaskActions(ctrl)),
    );
}

/** The index build starts this long after activation, when VS Code has finished starting. */
const SEARCH_INDEX_DELAY_MS = 5000;

/**
 * Builds the search index in the background after startup (#300), so the
 * first search is as fast as later ones; when, see {@link buildsIndexOnStartup}.
 * Otherwise the search builds the index when it opens.
 */
export function registerSearchIndexBuild(ctrl: Container, context: vscode.ExtensionContext): void {
    const timer = setTimeout(() => {
        if (!buildsIndexOnStartup(ctrl.config.getSearchSettings(), isRemoteSession())) { return; }
        const start = Date.now();
        ctrl.ui.prepareSearch()
            .then(() => ctrl.logger.debug(`Search index built in ${Date.now() - start} ms`))
            .catch(err => ctrl.logger.error("Failed to build the search index.", err));
    }, SEARCH_INDEX_DELAY_MS);
    context.subscriptions.push({ dispose: () => clearTimeout(timer) });
}

/** Wires the entry-scan cache invalidation listeners. */
export function registerCacheInvalidation(ctrl: Container, context: vscode.ExtensionContext): void {
    try {
        const scanner = ctrl.ui.getScanner();
        context.subscriptions.push(...scanner.registerInvalidationListeners());
    } catch (error) {
        ctrl.logger.error("Failed to register cache invalidation listeners, reason: ", error);
    }
}

/**
 * Wiki links (#92): Ctrl+click, completion after `[[` and the open command.
 * Returns the markdown-it plugin for the preview (`extendMarkdownIt`), which
 * renders from the last scan of the journal and refreshes the preview after a
 * scan, so the links appear once the journal was read.
 */
export function registerWikiLinks(ctrl: Container, context: vscode.ExtensionContext, index: JournalIndex): <T extends object>(md: T) => T {
    context.subscriptions.push(
        index.onDidScan(() => { void vscode.commands.executeCommand('markdown.preview.refresh').then(undefined, () => undefined); }),
        vscode.languages.registerDocumentLinkProvider(MARKDOWN_SELECTOR, new WikiLinkProvider(ctrl)),
        vscode.languages.registerCompletionItemProvider(MARKDOWN_SELECTOR, new WikiCompletionProvider(ctrl, index), '['),
        OpenWikiLinkCommand.create(ctrl, index),
    );
    return md => wikiLinkPlugin(md, previewResolver(() => index.peek()));
}

/**
 * Navigation between day, week and month (#311): the CodeLens on the first
 * line of journal entries, the calendar beside the editor and its commands.
 */
export function registerCalendar(ctrl: Container, context: vscode.ExtensionContext, index: JournalIndex): void {
    const lenses = new NavigationLensProvider(ctrl, index);
    context.subscriptions.push(
        lenses,
        vscode.languages.registerCodeLensProvider(MARKDOWN_SELECTOR, lenses),
        OpenCalendarCommand.create(ctrl, index),
        OpenWeekCommand.create(ctrl),
        OpenDayCommand.create(ctrl),
        vscode.commands.registerCommand(PICK_BACKLINK, (pages: string[]) => pickBacklink(ctrl, pages)),
    );
}
