// Copyright (C) 2026  Patrick Maué
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
'use strict';

import * as vscode from 'vscode';
import { firstDayOfWeek } from 'journal-core';
import { JournalIndex } from '../../shared/journal/journal-index';
import { JournalController } from '../../shared/model/index';
import { getEntryDayFromPath, getWeekFromPath } from '../../shared/paths';
import { createNonce } from '../../shared/webview/html';
import { calendarMonth, monthWeeks } from './calendar-model';
import { weekWikiTarget } from 'journal-core';
import { CalendarMessage, renderCalendar } from './calendar-view';
import { pageSummaries } from './day-summaries';

/** The services this uses of the controller, no more (#320). */
export type CalendarDeps = Pick<JournalController, 'config' | 'editor' | 'fs' | 'logger' | 'reader'>;

/** The day a journal file belongs to: a daily entry its day, a weekly entry its first day; undefined for other files. */
export function dayOfJournalFile(ctrl: Pick<JournalController, 'config'>, fsPath: string): Date | undefined {
    const day = getEntryDayFromPath(fsPath, ctrl.config);
    if (day) { return day; }
    const week = getWeekFromPath(fsPath, ctrl.config);
    return week && week.scope === 'default' ? firstDayOfWeek(week.week, week.year, ctrl.config.getLocale()) : undefined;
}

/**
 * The Journal Calendar (#311), one panel beside the editor. It follows the
 * active journal file (shows its month) and is rendered again when the
 * journal changes; clicks open (or create) days and weeks.
 */
export class CalendarPanel implements vscode.Disposable {

    private static current?: CalendarPanel;
    public static readonly viewType = 'journal.calendar';

    private year: number;
    private month: number;
    private readonly disposables: vscode.Disposable[] = [];

    private constructor(private readonly panel: vscode.WebviewPanel, private readonly ctrl: CalendarDeps, private readonly index: JournalIndex, date: Date) {
        this.year = date.getFullYear();
        this.month = date.getMonth() + 1;
        this.disposables.push(
            panel.onDidDispose(() => this.dispose()),
            panel.webview.onDidReceiveMessage((message: CalendarMessage) => this.handle(message)
                .catch(error => this.ctrl.logger.error("Calendar: failed to handle ", JSON.stringify(message), error))),
            vscode.window.onDidChangeActiveTextEditor(editor => this.follow(editor)),
            vscode.workspace.onDidSaveTextDocument(doc => { if (dayOfJournalFile(ctrl, doc.uri.fsPath)) { void this.render(); } }),
            index.onDidScan(() => { void this.render(); }),
        );
    }

    /** Shows the calendar at the month of the date (beside the editor), creating it if needed. */
    public static show(ctrl: CalendarDeps, index: JournalIndex, date: Date): CalendarPanel {
        if (CalendarPanel.current) {
            CalendarPanel.current.panel.reveal(undefined, true);
            void CalendarPanel.current.showMonth(date.getFullYear(), date.getMonth() + 1);
            return CalendarPanel.current;
        }
        const panel = vscode.window.createWebviewPanel(CalendarPanel.viewType, vscode.l10n.t("Journal Calendar"),
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true, localResourceRoots: [] });
        CalendarPanel.current = new CalendarPanel(panel, ctrl, index, date);
        void CalendarPanel.current.render();
        return CalendarPanel.current;
    }

    /** The rendered page (for tests). */
    public get html(): string {
        return this.panel.webview.html;
    }

    public async showMonth(year: number, month: number): Promise<void> {
        this.year = year;
        this.month = month;
        await this.render();
    }

    public async handle(message: CalendarMessage): Promise<void> {
        switch (message.type) {
            case 'day': {
                const [year, month, day] = message.key.split('-').map(Number);
                const path = await this.ctrl.reader.loadEntryForDay(new Date(year, month - 1, day));
                this.index.invalidate();
                await this.ctrl.editor.show(path);
                return this.render();
            }
            case 'week': {
                const path = await this.ctrl.reader.loadEntryForWeek(message.week, message.year);
                this.index.invalidate();
                await this.ctrl.editor.show(path);
                return this.render();
            }
            case 'month':
                return this.showMonth(message.year, message.month);
            case 'today': {
                const today = new Date();
                return this.showMonth(today.getFullYear(), today.getMonth() + 1);
            }
        }
    }

    /** Shows the month of the journal file in the active editor. */
    private follow(editor: vscode.TextEditor | undefined): void {
        if (!editor || editor.document.uri.scheme !== 'file') { return; }
        const day = dayOfJournalFile(this.ctrl, editor.document.uri.fsPath);
        if (day && (day.getFullYear() !== this.year || day.getMonth() + 1 !== this.month)) {
            void this.showMonth(day.getFullYear(), day.getMonth() + 1);
        }
    }

    private async render(): Promise<void> {
        const { year, month } = this;
        const locale = this.ctrl.config.getLocale();
        const files = await this.index.get();
        const weeks = monthWeeks(year, month, locale);
        const dayKeys = weeks.flatMap(week => week.days).map(date =>
            `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
        const [days, weekly] = await Promise.all([
            pageSummaries(this.ctrl.fs, this.ctrl.config, files.days, dayKeys),
            pageSummaries(this.ctrl.fs, this.ctrl.config, files.weeks, weeks.map(week => weekWikiTarget(week.week, week.year))),
        ]);
        // a later month may have been chosen while reading
        if (year !== this.year || month !== this.month || CalendarPanel.current !== this) { return; }
        const view = calendarMonth(year, month, locale, new Date(), days, weekly);
        this.panel.webview.html = renderCalendar(view, { cspSource: this.panel.webview.cspSource, nonce: createNonce() }, vscode.l10n.t);
    }

    public dispose(): void {
        if (CalendarPanel.current === this) { CalendarPanel.current = undefined; }
        this.disposables.forEach(d => d.dispose());
        this.panel.dispose();
    }
}
