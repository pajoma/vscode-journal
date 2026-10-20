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

import { escapeHtml, webviewHtml, WebviewPage } from '../../../shared/webview/html';
import { MoveKind } from '../migration';

/** Localizes a text with {0}, {1} … placeholders (vscode.l10n.t in the panel). */
export type Translate = (message: string, ...args: (string | number)[]) => string;

/** What the migration page shows; paths relative to the scope's base. */
export interface MigrationView {
    moves: { kind: MoveKind; from: string; to: string; scope: string }[];
    conflicts: { kind: MoveKind; from: string; to: string; scope: string; reason: 'exists' | 'duplicate' }[];
    /** The files whose links change, at their place after the migration. */
    links: { file: string; links: { from: string; to: string }[] }[];
    state: 'preview' | 'running' | 'done';
    result?: { moved: number; linkFiles: number; failed: { from: string; error: string }[] };
}

/** Messages from the page to the extension. */
export type MigrationMessage = { type: 'move' } | { type: 'close' };

/**
 * The page of Journal: Migrate to Current Layout (#309): a dry run that shows
 * every move, every link change and every conflict, with Move and Close
 * (preview only); after the move, what was done.
 */
export function renderMigration(view: MigrationView, page: WebviewPage, t: Translate): string {
    const linkCount = view.links.reduce((sum, file) => sum + file.links.length, 0);
    const kind = (k: MoveKind) => k === 'entry' ? t("Daily entry") : k === 'weekly' ? t("Weekly entry") : t("Note");
    const path = (p: string) => `<td class="path">${escapeHtml(p)}</td>`;
    const row = (cells: string) => `<tr data-filter>${cells}</tr>`;

    const parts: string[] = [`<h1>${escapeHtml(t("Migrate to Current Layout"))}</h1>`];
    parts.push(`<p class="muted" id="summary">${escapeHtml(t("{0} files to move · {1} links in {2} files to update · {3} files stay where they are",
        view.moves.length, linkCount, view.links.length, view.conflicts.length))}</p>`);

    if (view.state === 'done' && view.result) {
        const { moved, linkFiles, failed } = view.result;
        parts.push(`<div class="notice${failed.length > 0 ? ' error' : ''}" id="result">${escapeHtml(t("Moved {0} files, updated the links in {1} files.", moved, linkFiles))}`
            + (failed.length > 0 ? ` ${escapeHtml(t("{0} files could not be moved.", failed.length))}` : '') + '</div>');
        if (failed.length > 0) {
            parts.push(`<table><tr><th>${escapeHtml(t("File"))}</th><th>${escapeHtml(t("Error"))}</th></tr>`
                + failed.map(f => `<tr>${path(f.from)}<td>${escapeHtml(f.error)}</td></tr>`).join('') + '</table>');
        }
    } else {
        parts.push(`<div class="notice" id="dry-run">${escapeHtml(t("Dry run: nothing has been changed yet. Check the moves and link changes below, then move the files or close this preview."))}</div>`);
    }

    const running = view.state === 'running';
    const buttons = view.state === 'done'
        ? `<button id="close">${escapeHtml(t("Close"))}</button>`
        : `<button id="move"${view.moves.length === 0 || running ? ' disabled' : ''}>${escapeHtml(running ? t("Moving…") : t("Move {0} files", view.moves.length))}</button>`
        + `<button id="close" class="secondary"${running ? ' disabled' : ''}>${escapeHtml(t("Close (preview only)"))}</button>`;
    parts.push(`<div class="toolbar"><input type="search" id="filter" placeholder="${escapeHtml(t("Filter by path or link"))}"><span class="spacer"></span>${buttons}</div>`);

    parts.push(`<h2>${escapeHtml(t(view.state === 'done' ? "Moved ({0})" : "To move ({0})", view.moves.length))}</h2>`);
    parts.push(view.moves.length === 0 ? `<p class="muted">${escapeHtml(t("None."))}</p>`
        : `<table id="moves"><tr><th>${escapeHtml(t("Type"))}</th><th>${escapeHtml(t("From"))}</th><th>${escapeHtml(t("To"))}</th><th>${escapeHtml(t("Scope"))}</th></tr>`
        + view.moves.map(m => row(`<td>${escapeHtml(kind(m.kind))}</td>${path(m.from)}${path(m.to)}<td>${escapeHtml(m.scope)}</td>`)).join('') + '</table>');

    parts.push(`<h2>${escapeHtml(t("Link changes ({0} in {1} files)", linkCount, view.links.length))}</h2>`);
    parts.push(view.links.length === 0 ? `<p class="muted">${escapeHtml(t("None."))}</p>`
        : `<div id="links">` + view.links.map(file => `<details data-filter><summary><span class="path">${escapeHtml(file.file)}</span> <span class="muted">(${file.links.length})</span></summary>`
            + `<table><tr><th>${escapeHtml(t("Link before"))}</th><th>${escapeHtml(t("Link after"))}</th></tr>`
            + file.links.map(link => `<tr>${path(link.from)}${path(link.to)}</tr>`).join('') + '</table></details>').join('') + '</div>');

    if (view.conflicts.length > 0) {
        parts.push(`<h2>${escapeHtml(t("Stay where they are ({0})", view.conflicts.length))}</h2>`);
        parts.push(`<div class="notice warning">${escapeHtml(t("The target exists already (or another file goes there). These files are not moved; merge them by hand."))}</div>`);
        parts.push(`<table id="conflicts"><tr><th>${escapeHtml(t("Type"))}</th><th>${escapeHtml(t("File"))}</th><th>${escapeHtml(t("Target"))}</th><th>${escapeHtml(t("Scope"))}</th></tr>`
            + view.conflicts.map(c => row(`<td>${escapeHtml(kind(c.kind))}</td>${path(c.from)}${path(c.to)}<td>${escapeHtml(c.scope)}</td>`)).join('') + '</table>');
    }

    return webviewHtml(page, t("Migrate to Current Layout"), parts.join('\n'), SCRIPT);
}

/** Buttons post their message; the filter hides rows and files whose text does not contain it. */
const SCRIPT = `
const vscode = acquireVsCodeApi();
for (const [id, type] of [['move', 'move'], ['close', 'close']]) {
    const button = document.getElementById(id);
    if (button) {
        button.addEventListener('click', () => {
            document.querySelectorAll('button').forEach(b => b.disabled = true);
            vscode.postMessage({ type });
        });
    }
}
const filter = document.getElementById('filter');
filter.addEventListener('input', () => {
    const query = filter.value.trim().toLowerCase();
    document.querySelectorAll('[data-filter]').forEach(element => {
        element.hidden = query !== '' && !element.textContent.toLowerCase().includes(query);
        if (query !== '' && !element.hidden && element.tagName === 'DETAILS') { element.open = true; }
    });
});
`;
