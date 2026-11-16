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

/** Remembers that the user does not want the hint again. */
const DISMISSED = 'journal.scopes.legacyPatternsHint';

/**
 * The scopes of `journal.scopes` that still have their own `patterns` or
 * `patternHistory`: since 1.2 the notes of a scope lie flat in its folder,
 * those settings are no longer read.
 */
export function scopesWithPatterns(scopes: unknown): string[] {
    if (!Array.isArray(scopes)) { return []; }
    return scopes.filter((scope): scope is { name: string } => typeof scope === 'object' && scope !== null
        && typeof (scope as { name?: unknown }).name === 'string'
        && ((scope as { patterns?: unknown }).patterns !== undefined || (scope as { patternHistory?: unknown }).patternHistory !== undefined))
        .map(scope => scope.name);
}

/**
 * Tells once that scopes with their own patterns now keep new notes flat in
 * their folder, while older notes stay where they are (and are still found).
 * Nothing is moved; "Don't Show Again" is remembered.
 */
export async function hintLegacyScopePatterns(state: vscode.Memento): Promise<void> {
    if (state.get<boolean>(DISMISSED)) { return; }
    const names = scopesWithPatterns(vscode.workspace.getConfiguration('journal').get('scopes'));
    if (names.length === 0) { return; }
    const docs = vscode.l10n.t("Learn More");
    const settings = vscode.l10n.t("Open Settings");
    const never = vscode.l10n.t("Don't Show Again");
    const choice = await vscode.window.showInformationMessage(
        vscode.l10n.t("The scopes {0} have their own patterns in journal.scopes. Notes of a scope now lie flat in its folder: new notes go there, older ones stay where they are and are still found. The patterns are no longer read.", names.map(name => `#${name}`).join(', ')),
        docs, settings, never);
    if (choice === docs) {
        await vscode.env.openExternal(vscode.Uri.parse('https://github.com/pajoma/vscode-journal/blob/main/docs/scopes.md#configuring-scopes'));
    } else if (choice === settings) {
        await vscode.commands.executeCommand('workbench.action.openSettingsJson', { revealSetting: { key: 'journal.scopes' } });
    } else if (choice === never) {
        await state.update(DISMISSED, true);
    }
}
