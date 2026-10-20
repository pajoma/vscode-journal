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
import moment = require('moment');
import { dayWikiTarget, daysOfWeek, weekOf } from 'journal-core';
import { JournalIndex } from '../../shared/journal/journal-index';
import { JournalController } from '../../shared/model/index';
import { getEntryDayFromPath, getWeekFromPath } from '../../shared/paths';
import { monthsOfWeek } from './calendar-model';

/**
 * Quick links on the first line of journal entries (#311): a daily entry links
 * its week and its month, a weekly entry its seven days and its month(s).
 * A day without entry is marked with a "+": the click creates it.
 */
export class NavigationLensProvider implements vscode.CodeLensProvider {

    private readonly changed = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this.changed.event;

    constructor(private readonly ctrl: JournalController, private readonly index: JournalIndex) {
        index.onDidScan(() => this.changed.fire());
    }

    async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
        if (document.uri.scheme !== 'file') { return []; }
        const locale = this.ctrl.config.getLocale();
        const range = new vscode.Range(0, 0, 0, 0);
        const lens = (title: string, command: string, args: unknown[], tooltip?: string) => new vscode.CodeLens(range, { title, command, arguments: args, tooltip });
        const monthLens = ({ year, month }: { year: number; month: number }) =>
            lens(`$(calendar) ${moment(new Date(year, month - 1, 1)).locale(locale).format('MMMM YYYY')}`, 'journal.openCalendar', [year, month], vscode.l10n.t("Open the calendar"));

        const day = getEntryDayFromPath(document.uri.fsPath, this.ctrl.config);
        if (day) {
            const week = weekOf(day, locale);
            return [
                lens(`$(arrow-up) ${vscode.l10n.t("Week {0}", week.week)}`, 'journal.openWeek', [week.week, week.year], vscode.l10n.t("Open the weekly entry")),
                monthLens({ year: day.getFullYear(), month: day.getMonth() + 1 }),
            ];
        }

        const week = getWeekFromPath(document.uri.fsPath, this.ctrl.config);
        if (!week || week.scope !== 'default') { return []; }
        const files = await this.index.get();
        const days = daysOfWeek(week.week, week.year, locale).map(date => {
            const key = dayWikiTarget(date);
            const label = moment(date).locale(locale).format('dd D');
            return files.days.has(key)
                ? lens(label, 'journal.openDay', [key], vscode.l10n.t("Open the entry of {0}", key))
                : lens(`$(add) ${label}`, 'journal.openDay', [key], vscode.l10n.t("{0}: no entry yet, a click creates it", key));
        });
        return [...days, ...monthsOfWeek(week.week, week.year, locale).map(monthLens)];
    }
}
