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
import { DEFAULT_URL, FailureReason, SuperProductivityError, SuperProductivitySettings, TokenStore } from './client';

const TOKEN_KEY = 'journal.superProductivity.token';

/** `journal.superProductivity.*`, read on every use: a change needs no reload. */
export function superProductivitySettings(): SuperProductivitySettings {
    const config = vscode.workspace.getConfiguration('journal');
    const url = config.get<string>('superProductivity.url') || DEFAULT_URL;
    return {
        enabled: config.get<boolean>('superProductivity.enabled', false),
        url: url.replace(/\/+$/, ''),
        projects: config.get<Record<string, string>>('superProductivity.projects') ?? {},
    };
}

/** The token in the secret storage of VS Code, never in the settings. */
export function tokenStore(secrets: vscode.SecretStorage): TokenStore {
    return {
        get: async () => secrets.get(TOKEN_KEY),
        store: async token => secrets.store(TOKEN_KEY, token),
    };
}

/** What to tell the user when a request to Super Productivity failed. */
export function failureMessage(error: unknown): string {
    const reason: FailureReason = error instanceof SuperProductivityError ? error.reason : 'failed';
    switch (reason) {
        case 'no-token': return vscode.l10n.t("No API token for Super Productivity. Run the command 'Journal: Set Super Productivity API Token' first.");
        case 'unreachable': return vscode.l10n.t("Super Productivity is not reachable at {0}. Is the desktop app running, with the Local REST API turned on?", superProductivitySettings().url);
        case 'rejected': return vscode.l10n.t("Super Productivity rejected the API token. Run the command 'Journal: Set Super Productivity API Token' again.");
        case 'failed': return vscode.l10n.t("The request to Super Productivity failed.");
    }
}
