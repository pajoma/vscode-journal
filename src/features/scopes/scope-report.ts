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

import moment = require('moment');
import * as Path from 'path';
import { firstLinkingDays, isScopeReport, scopeNames, scopeReport } from 'journal-core';
import { JournalIndex } from '../../shared/journal/journal-index';
import { pathKey } from '../../shared/paths';
import { planPages } from '../../shared/journal/plan-pages';
import { JournalController } from '../../shared/model/index';

/** How many days of the journal the report shows by default. */
export const REPORT_DAYS = 30;

/** The days of the journal a report shows: from and to (inclusive), `YYYY-MM-DD`. */
export interface ReportPeriod {
    from: string;
    to: string;
}

/** The last {@link REPORT_DAYS} days up to `today`: the period of a report by default. */
export function lastDays(today: Date = new Date()): ReportPeriod {
    return { from: moment(today).subtract(REPORT_DAYS - 1, 'd').format('YYYY-MM-DD'), to: moment(today).format('YYYY-MM-DD') };
}

/**
 * The report of a scope (docs/specs/2026-11-13-scopes-keys-plans.md,
 * decision 19): the plan by heading with the state of each item, the notes
 * of its folder newest first, its tasks in the journal of the last 30 days by
 * day. A page in the journal's .vscode folder, `<base>/.vscode/scopes/<scope>.<ext>`,
 * written again when it is shown and its content changed, with wiki links
 * like the weekly entries: the markdown preview follows them only from a
 * file of the journal. Hidden folders are not scanned, so the page is no note,
 * plan or search hit.
 */
export class ScopeReports {

    constructor(private readonly ctrl: Pick<JournalController, 'config' | 'fs'>, private readonly index: JournalIndex) { }

    /** The page of the report of the scope; undefined for no scope (or the default scope). */
    public pathOf(scopeName: string): string | undefined {
        const scope = this.ctrl.config.getScope(scopeName);
        return scope.isDefault ? undefined : Path.join(this.ctrl.config.getBasePath(), '.vscode', 'scopes', `${scope.name}.${this.ctrl.config.getFileExtension()}`);
    }

    /** Writes the report of the scope for the period; returns its page, undefined for no scope. */
    public async write(scopeName: string, period: ReportPeriod = lastDays()): Promise<string | undefined> {
        const path = this.pathOf(scopeName);
        const text = path && await this.report(scopeName, period);
        if (!path || text === undefined) { return undefined; }
        const before = await this.ctrl.fs.readFile(path).then(data => new TextDecoder().decode(data), () => undefined);
        if (before !== text) {
            await this.ctrl.fs.createDirectory(Path.dirname(path));
            await this.ctrl.fs.writeFile(path, Buffer.from(text));
        }
        return path;
    }

    /** The report as markdown, undefined for no scope. */
    public async report(scopeName: string, period: ReportPeriod = lastDays()): Promise<string | undefined> {
        const scope = this.ctrl.config.getScope(scopeName);
        if (scope.isDefault) { return undefined; }
        const [files, { entries, plans }] = await Promise.all([this.index.get(), planPages(this.index, this.ctrl.config)]);
        // the wiki link target of each file, as the journal names it
        const targets = new Map<string, string>();
        for (const [target, file] of [...files.days, ...files.weeks]) { targets.set(pathKey(file), target); }
        for (const [file, target] of files.targets) { targets.set(pathKey(file), target); }
        // every page of the scope folder but the report, dated by the first entry linking to it
        const days = firstLinkingDays(files.notes, entries);
        const notes = files.notes.filter(note => note.scope === scope.name && !isScopeReport(note.path))
            .map(note => ({ name: note.title, path: note.path, day: days.get(note.path) }));
        return scopeReport({
            scope: scope.name,
            plans: plans.filter(plan => plan.scope === scope.name).map(plan => ({ ...plan, name: Path.parse(plan.path).name.replace(/_/g, ' ') })),
            entries,
            from: period.from,
            to: period.to,
            scopeName: scopeNames(this.ctrl.config),
            link: (path, name) => `[[${targets.get(pathKey(path)) ?? name}]]`,
            notes,
        });
    }
}
