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
import * as Path from 'path';
import moment = require('moment');
import { dayWikiTarget, parseWikiTarget, weekOf, weekWikiTarget } from 'journal-core';
import { JournalIndex } from '../../shared/journal/journal-index';
import { timed } from '../../shared/logging/timing';
import { JournalController } from '../../shared/model/index';
import { getEntryDayFromPath, getWeekFromPath, isJournalEntry } from '../../shared/paths';
import { adjacentKey, monthsOfWeek, shiftWeek } from './calendar-model';

/** The command that lets the user pick one of many backlinks. */
export const PICK_BACKLINK = 'journal.pickBacklink';
/** Backlinks shown as CodeLens; more are offered in a picker. */
const BACKLINKS_SHOWN = 5;

/**
 * Links on the first line of journal files (#311), up and sideways:
 *
 * - a daily entry: previous day · its week · next day
 * - a weekly entry: previous week · its month(s) · next week
 * - a note: the pages that link to it (backlinks)
 *
 * Previous and next follow `journal.navigation.mode`: `existing`, the nearest
 * day or week with an entry (none at the start or end of the journal);
 * `calendar`, the day or week before and after, created on click. The days of
 * a week are links in its markdown (weekly sync).
 */
export class NavigationLensProvider implements vscode.CodeLensProvider, vscode.Disposable {

    private readonly changed = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this.changed.event;
    private readonly disposables: vscode.Disposable[];

    constructor(private readonly ctrl: JournalController, private readonly index: JournalIndex) {
        this.disposables = [
            this.changed,
            index.onDidScan(() => this.changed.fire()),
            // a saved page may link a note now (or no longer)
            vscode.workspace.onDidSaveTextDocument(() => this.changed.fire()),
        ];
    }

    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }

    provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
        if (document.uri.scheme !== 'file') { return Promise.resolve([]); }
        return timed(this.ctrl.logger, `CodeLens ${Path.basename(document.uri.fsPath)}`, () => this.lenses(document));
    }

    private async lenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
        const file = document.uri.fsPath;
        const locale = this.ctrl.config.getLocale();
        const range = new vscode.Range(0, 0, 0, 0);
        const lens = (title: string, command: string, args: unknown[], tooltip?: string) => new vscode.CodeLens(range, { title, command, arguments: args, tooltip });
        const monthLens = ({ year, month }: { year: number; month: number }) =>
            lens(`$(calendar) ${moment(new Date(year, month - 1, 1)).locale(locale).format('MMMM YYYY')}`, 'journal.openCalendar', [year, month], vscode.l10n.t("Open the calendar"));

        const existing = this.ctrl.config.getNavigationMode() !== 'calendar';
        const day = getEntryDayFromPath(file, this.ctrl.config);
        if (day) {
            const key = dayWikiTarget(day);
            const step = (by: number) => { const d = new Date(day); d.setDate(d.getDate() + by); return dayWikiTarget(d); };
            const days = existing ? [...(await this.index.get()).days.keys()] : [];
            const previous = existing ? adjacentKey(days, key, 'previous') : step(-1);
            const next = existing ? adjacentKey(days, key, 'next') : step(1);
            const dayLabel = (target: string) => {
                const parsed = parseWikiTarget(target);
                return parsed.kind === 'day' ? moment(new Date(parsed.year, parsed.month - 1, parsed.day)).locale(locale).format('dd, ll') : target;
            };
            const week = weekOf(day, locale);
            return [
                ...(previous ? [lens(`$(arrow-left) ${dayLabel(previous)}`, 'journal.openDay', [previous], vscode.l10n.t("The previous day"))] : []),
                lens(`$(arrow-up) ${vscode.l10n.t("Week {0}", week.week)}`, 'journal.openWeek', [week.week, week.year], vscode.l10n.t("Open the weekly entry")),
                ...(next ? [lens(`${dayLabel(next)} $(arrow-right)`, 'journal.openDay', [next], vscode.l10n.t("The next day"))] : []),
            ];
        }

        const week = getWeekFromPath(file, this.ctrl.config);
        if (week) {
            if (week.scope !== 'default') { return []; }
            const key = weekWikiTarget(week.week, week.year);
            const weekOfKey = (target: string | undefined) => {
                const parsed = target ? parseWikiTarget(target) : undefined;
                return parsed?.kind === 'week' ? { week: parsed.week, year: parsed.year } : undefined;
            };
            const weeks = existing ? [...(await this.index.get()).weeks.keys()] : [];
            const previous = existing ? weekOfKey(adjacentKey(weeks, key, 'previous')) : shiftWeek(week.week, week.year, -1, locale);
            const next = existing ? weekOfKey(adjacentKey(weeks, key, 'next')) : shiftWeek(week.week, week.year, 1, locale);
            return [
                ...(previous ? [lens(`$(arrow-left) ${vscode.l10n.t("Week {0}", previous.week)}`, 'journal.openWeek', [previous.week, previous.year], vscode.l10n.t("The previous week"))] : []),
                ...monthsOfWeek(week.week, week.year, locale).map(monthLens),
                ...(next ? [lens(`${vscode.l10n.t("Week {0}", next.week)} $(arrow-right)`, 'journal.openWeek', [next.week, next.year], vscode.l10n.t("The next week"))] : []),
            ];
        }

        // a note (any other journal file): the pages that link to it
        const files = await this.index.get();
        if (!files.notes.some(note => Path.normalize(note.path) === Path.normalize(file)) || isJournalEntry(file, this.ctrl.config)) { return []; }
        const pages = await timed(this.ctrl.logger, '  backlinks', () => this.index.linksTo(file));
        const lenses = pages.slice(0, BACKLINKS_SHOWN).map(page =>
            lens(`$(arrow-up) ${pageTitle(this.ctrl, page, locale)}`, 'vscode.open', [vscode.Uri.file(page)], vscode.l10n.t("Links to this note")));
        if (pages.length > BACKLINKS_SHOWN) {
            lenses.push(lens(`$(arrow-up) ${vscode.l10n.t("{0} more", pages.length - BACKLINKS_SHOWN)}`, PICK_BACKLINK, [pages], vscode.l10n.t("All pages that link to this note")));
        }
        return lenses;
    }
}

/** How a page is named: a daily entry by its day, a weekly entry by its week, a note by its file name. */
export function pageTitle(ctrl: JournalController, page: string, locale: string): string {
    const day = getEntryDayFromPath(page, ctrl.config);
    if (day) { return moment(day).locale(locale).format('dd, YYYY-MM-DD'); }
    const week = getWeekFromPath(page, ctrl.config);
    if (week) { return vscode.l10n.t("Week {0}", week.week) + ` ${week.year}`; }
    return Path.parse(page).name.replace(/_/g, ' ');
}

/** Picks one of the pages that link to a note and opens it. */
export async function pickBacklink(ctrl: JournalController, pages: string[]): Promise<void> {
    const locale = ctrl.config.getLocale();
    const base = ctrl.config.getBasePath();
    const picked = await vscode.window.showQuickPick(
        pages.map(page => ({ label: pageTitle(ctrl, page, locale), description: Path.relative(base, page).split(Path.sep).join('/'), page })),
        { placeHolder: vscode.l10n.t("Pages that link to this note") });
    if (picked) { await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(picked.page)); }
}
