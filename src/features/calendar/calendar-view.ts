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

import { escapeHtml, webviewHtml, WebviewPage } from '../../shared/webview/html';
import { CalendarDay, CalendarMonth, CalendarScope, CalendarWeek, DaySummary } from './calendar-model';

/** Localizes a text with {0}, {1} … placeholders (vscode.l10n.t in the panel). */
export type Translate = (message: string, ...args: (string | number)[]) => string;

/** Messages from the page to the extension. */
export type CalendarMessage =
    | { type: 'day'; key: string }
    | { type: 'week'; week: number; year: number }
    | { type: 'month'; year: number; month: number }
    | { type: 'today' }
    | { type: 'scope'; scope: string; from: string; to: string };

/**
 * The Journal Calendar (#311): a month with the week numbers in front of the
 * weeks. A week number opens the weekly entry, a day its daily entry (both
 * created if missing). A day shows its open and all tasks and its notes and
 * is marked while tasks are open; days without entry are dimmed. The scopes
 * worked on are shown by week and for the month; a click shows the report of
 * the scope for that week or month.
 */
export function renderCalendar(month: CalendarMonth, page: WebviewPage, t: Translate): string {
    const header = `<tr><th class="week">${escapeHtml(t("Week"))}</th>${month.weekdays.map(day => `<th>${escapeHtml(day)}</th>`).join('')}</tr>`;
    const rows = month.weeks.map(week => {
        return `<tr>${weekCell(week, t)}${week.days.map(day => dayCell(day, t)).join('')}</tr>`;
    }).join('\n');

    const body = `
<div class="toolbar">
<button id="previous" class="secondary" title="${escapeHtml(t("Previous month"))}">‹</button>
<h1>${escapeHtml(month.title)}</h1>
<button id="next" class="secondary" title="${escapeHtml(t("Next month"))}">›</button>
<span class="spacer"></span>
<button id="today" class="secondary">${escapeHtml(t("Today"))}</button>
</div>
<table class="calendar" data-year="${month.year}" data-month="${month.month}">
${header}
${rows}
</table>
${monthScopes(month, t)}
<p class="muted legend">${escapeHtml(t("Open tasks / all tasks · notes. Dimmed days have no entry yet; a click creates it."))}</p>`;
    return webviewHtml(page, month.title, body, SCRIPT, STYLE);
}

function dayCell(day: CalendarDay, t: Translate): string {
    const classes = ['day', day.inMonth ? '' : 'outside', day.today ? 'today' : '', day.entry ? '' : 'missing', day.entry && day.entry.open > 0 ? 'open' : ''].filter(Boolean).join(' ');
    const title = day.entry
        ? [day.key, ...countsTitle(day.entry, t)].join(' · ')
        : t("{0}: no entry yet, a click creates it", day.key);
    return `<td><button class="${classes}" data-day="${day.key}" title="${escapeHtml(title)}"><span class="number">${day.day}</span>${counts(day.entry, t)}</button></td>`;
}

/** The week number, and like a day the tasks and notes of its weekly entry, marked while tasks are open. */
function weekCell(week: CalendarWeek, t: Translate): string {
    const classes = ['week', week.exists ? '' : 'missing', week.entry && week.entry.open > 0 ? 'open' : ''].filter(Boolean).join(' ');
    const title = week.entry
        ? [t("Open week {0}", week.week), ...countsTitle(week.entry, t)].join(' · ')
        : week.exists ? t("Open week {0}", week.week) : t("Create week {0}", week.week);
    const scopes = week.scopes.length
        ? `<div class="scopes">${week.scopes.map(scope => scopeButton(scope, week.from, week.to, `#${scope.scope}`, t("#{0} in week {1}: {2} done, {3} open", scope.scope, week.week, scope.done, scope.open))).join('')}</div>`
        : '';
    return `<td class="week"><button class="${classes}" data-week="${week.week}" data-year="${week.year}" title="${escapeHtml(title)}"><span class="number">${week.week}</span>${counts(week.entry, t)}</button>${scopes}</td>`;
}

/** The scopes of the month with their tasks; a click shows the report of the scope for the month. */
function monthScopes(month: CalendarMonth, t: Translate): string {
    if (month.scopes.length === 0) { return ''; }
    const buttons = month.scopes.map(scope => scopeButton(scope, month.from, month.to,
        `#${scope.scope} <span class="tasks">${escapeHtml(t("{0} done · {1} open", scope.done, scope.open))}</span>`,
        t("Report of #{0} for {1}", scope.scope, month.title), true)).join('');
    return `<h2 class="scopes-title">${escapeHtml(t("Scopes in {0}", month.title))}</h2><div class="month-scopes">${buttons}</div>`;
}

/** A button that shows the report of the scope from `from` to `to`; `label` is text, or HTML with `html`. */
function scopeButton(scope: CalendarScope, from: string, to: string, label: string, title: string, html = false): string {
    const classes = ['scope', scope.open > 0 ? 'open' : ''].filter(Boolean).join(' ');
    return `<button class="${classes}" data-scope="${escapeHtml(scope.scope)}" data-from="${from}" data-to="${to}" title="${escapeHtml(title)}">${html ? label : escapeHtml(label)}</button>`;
}

/** Open / all tasks (⚠ while some are open, ✓ when all are done) and the notes of an entry. */
function counts(entry: DaySummary | undefined, t: Translate): string {
    if (!entry) { return ''; }
    const lines: string[] = [];
    if (entry.tasks > 0) { lines.push(`<span class="tasks">${entry.open > 0 ? '⚠ ' : '✓ '}${entry.open}/${entry.tasks}</span>`); }
    if (entry.notes > 0) { lines.push(`<span class="notes">${escapeHtml(entry.notes === 1 ? t("1 note") : t("{0} notes", entry.notes))}</span>`); }
    return lines.join('');
}

function countsTitle(entry: DaySummary, t: Translate): string[] {
    return [
        entry.tasks > 0 ? t("{0} of {1} tasks open", entry.open, entry.tasks) : '',
        entry.notes > 0 ? (entry.notes === 1 ? t("1 note") : t("{0} notes", entry.notes)) : '',
    ].filter(Boolean);
}

const STYLE = `
.toolbar h1 { margin: 0; min-width: 12em; text-align: center; }
table.calendar { table-layout: fixed; }
table.calendar th { text-align: center; }
table.calendar td { padding: 2px; border: none; }
th.week, td.week { width: 4.5em; }
button.day, button.week { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-height: 4.2em; padding: 4px 6px;
  color: var(--vscode-foreground); background: var(--vscode-editorWidget-background, transparent); border: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,.25)); border-radius: 3px; text-align: left; }
button.week { align-items: center; justify-content: center; }
button.week .number { color: var(--vscode-descriptionForeground); }
button.day:hover, button.week:hover { background: var(--vscode-list-hoverBackground); }
button.missing { opacity: .45; border-style: dashed; }
button.outside { opacity: .3; }
button.outside.missing { opacity: .2; }
button.today { border: 2px solid var(--vscode-focusBorder); }
button.open { border-left: 4px solid var(--vscode-editorWarning-foreground, #cca700); }
.number { font-weight: 600; }
.tasks, .notes { font-size: .85em; color: var(--vscode-descriptionForeground); }
button.open .tasks { color: var(--vscode-editorWarning-foreground, #cca700); }
.legend { margin-top: 8px; }
td.week .scopes { display: flex; flex-wrap: wrap; gap: 2px; margin-top: 2px; }
button.scope { font-size: .75em; padding: 1px 4px; border-radius: 3px; border: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,.25));
  color: var(--vscode-textLink-foreground); background: transparent; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
button.scope:hover { background: var(--vscode-list-hoverBackground); }
button.scope.open { border-left: 3px solid var(--vscode-editorWarning-foreground, #cca700); }
h2.scopes-title { font-size: 1em; margin: 12px 0 4px; }
.month-scopes { display: flex; flex-wrap: wrap; gap: 6px; }
.month-scopes button.scope { font-size: .9em; padding: 3px 8px; }
`;

/** Clicks post their message; nothing else runs in the page. */
const SCRIPT = `
const vscode = acquireVsCodeApi();
const table = document.querySelector('table.calendar');
const year = Number(table.dataset.year), month = Number(table.dataset.month);
document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) { return; }
    if (button.dataset.scope) { vscode.postMessage({ type: 'scope', scope: button.dataset.scope, from: button.dataset.from, to: button.dataset.to }); }
    else if (button.dataset.day) { vscode.postMessage({ type: 'day', key: button.dataset.day }); }
    else if (button.dataset.week) { vscode.postMessage({ type: 'week', week: Number(button.dataset.week), year: Number(button.dataset.year) }); }
    else if (button.id === 'previous') { vscode.postMessage({ type: 'month', year: month === 1 ? year - 1 : year, month: month === 1 ? 12 : month - 1 }); }
    else if (button.id === 'next') { vscode.postMessage({ type: 'month', year: month === 12 ? year + 1 : year, month: month === 12 ? 1 : month + 1 }); }
    else if (button.id === 'today') { vscode.postMessage({ type: 'today' }); }
});
`;
