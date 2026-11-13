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
import * as vscode from 'vscode';
import * as Path from 'path';
import { scopeNames, scopeReport } from 'journal-core';
import { JournalIndex } from '../../shared/journal/journal-index';
import { planPages } from '../../shared/journal/plan-pages';
import { JournalController } from '../../shared/model/index';

/** The scheme of the generated report of a scope: `journal-scope:/acme.md`. */
export const REPORT_SCHEME = 'journal-scope';

/** How many days of the journal the report shows. */
export const REPORT_DAYS = 30;

/** The address of the report of a scope. */
export function reportUri(scope: string): vscode.Uri {
    return vscode.Uri.from({ scheme: REPORT_SCHEME, path: `/${scope}.md` });
}

/**
 * The report of a scope (docs/specs/2026-11-13-scopes-keys-plans.md,
 * decision 19), generated from the journal each time it is opened: the plan
 * by heading with the state of each item, its tasks in the journal of the
 * last 30 days by day. A read-only document, never saved.
 */
export class ScopeReportProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
    private readonly changed = new vscode.EventEmitter<vscode.Uri>();
    public readonly onDidChange = this.changed.event;

    constructor(private readonly ctrl: Pick<JournalController, 'config'>, private readonly index: JournalIndex) { }

    /** Generates the report again, for an open report. */
    public refresh(uri: vscode.Uri): void {
        this.changed.fire(uri);
    }

    public provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        return this.report(uri);
    }

    /** The report at `uri` (`journal-scope:/acme.md`), of the days up to `today`. */
    public async report(uri: vscode.Uri, today: Date = new Date()): Promise<string> {
        const scope = this.ctrl.config.getScope(Path.posix.basename(uri.path, '.md'));
        if (scope.isDefault) { return vscode.l10n.t("No scope named {0}.", Path.posix.basename(uri.path, '.md')); }
        const { entries, plans } = await planPages(this.index, this.ctrl.config);
        return scopeReport({
            scope: scope.name,
            plans: plans.filter(plan => plan.scope === scope.name).map(plan => ({ ...plan, name: Path.parse(plan.path).name.replace(/_/g, ' ') })),
            entries,
            from: moment(today).subtract(REPORT_DAYS - 1, 'd').format('YYYY-MM-DD'),
            to: moment(today).format('YYYY-MM-DD'),
            scopeName: scopeNames(this.ctrl.config),
            link: path => vscode.Uri.file(path).toString(),
        });
    }

    public dispose(): void {
        this.changed.dispose();
    }
}
