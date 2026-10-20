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
import { CalendarDay, CalendarMonth } from './calendar-model';

/** Localizes a text with {0}, {1} … placeholders (vscode.l10n.t in the panel). */
export type Translate = (message: string, ...args: (string | number)[]) => string;

/** Messages from the page to the extension. */
export type CalendarMessage =
    | { type: 'day'; key: string }
    | { type: 'week'; week: number; year: number }
    | { type: 'month'; year: number; month: number }
    | { type: 'today' };

/**
 * The Journal Calendar (#311): a month with the week numbers in front of the
 * weeks. A week number opens the weekly entry, a day its daily entry (both
 * created if missing). A day shows its open and all tasks and its notes and
 * is marked while tasks are open; days without entry are dimmed.
 */
export function renderCalendar(month: CalendarMonth, page: WebviewPage, t: Translate): string {
    const header = `<tr><th class="week">${escapeHtml(t("Week"))}</th>${month.weekdays.map(day => `<th>${escapeHtml(day)}</th>`).join('')}</tr>`;
    const rows = month.weeks.map(week => {
        const weekCell = `<td class="week"><button class="week${week.exists ? '' : ' missing'}" data-week="${week.week}" data-year="${week.year}" title="${escapeHtml(week.exists ? t("Open week {0}", week.week) : t("Create week {0}", week.week))}">${week.week}</button></td>`;
        return `<tr>${weekCell}${week.days.map(day => dayCell(day, t)).join('')}</tr>`;
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
<p class="muted legend">${escapeHtml(t("Open tasks / all tasks · notes. Dimmed days have no entry yet; a click creates it."))}</p>`;
    return webviewHtml(page, month.title, body, SCRIPT, STYLE);
}

function dayCell(day: CalendarDay, t: Translate): string {
    const classes = ['day', day.inMonth ? '' : 'outside', day.today ? 'today' : '', day.entry ? '' : 'missing', day.entry && day.entry.open > 0 ? 'open' : ''].filter(Boolean).join(' ');
    const lines: string[] = [];
    if (day.entry) {
        if (day.entry.tasks > 0) { lines.push(`<span class="tasks">${day.entry.open > 0 ? '⚠ ' : '✓ '}${day.entry.open}/${day.entry.tasks}</span>`); }
        if (day.entry.notes > 0) { lines.push(`<span class="notes">${escapeHtml(day.entry.notes === 1 ? t("1 note") : t("{0} notes", day.entry.notes))}</span>`); }
    }
    const title = day.entry
        ? [day.key, day.entry.tasks > 0 ? t("{0} of {1} tasks open", day.entry.open, day.entry.tasks) : '', day.entry.notes > 0 ? (day.entry.notes === 1 ? t("1 note") : t("{0} notes", day.entry.notes)) : ''].filter(Boolean).join(' · ')
        : t("{0}: no entry yet, a click creates it", day.key);
    return `<td><button class="${classes}" data-day="${day.key}" title="${escapeHtml(title)}"><span class="number">${day.day}</span>${lines.join('')}</button></td>`;
}

const STYLE = `
.toolbar h1 { margin: 0; min-width: 12em; text-align: center; }
table.calendar { table-layout: fixed; }
table.calendar th { text-align: center; }
table.calendar td { padding: 2px; border: none; }
th.week, td.week { width: 3.5em; }
button.day, button.week { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-height: 4.2em; padding: 4px 6px;
  color: var(--vscode-foreground); background: var(--vscode-editorWidget-background, transparent); border: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,.25)); border-radius: 3px; text-align: left; }
button.week { align-items: center; justify-content: center; font-weight: 600; color: var(--vscode-descriptionForeground); }
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
`;

/** Clicks post their message; nothing else runs in the page. */
const SCRIPT = `
const vscode = acquireVsCodeApi();
const table = document.querySelector('table.calendar');
const year = Number(table.dataset.year), month = Number(table.dataset.month);
document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) { return; }
    if (button.dataset.day) { vscode.postMessage({ type: 'day', key: button.dataset.day }); }
    else if (button.dataset.week) { vscode.postMessage({ type: 'week', week: Number(button.dataset.week), year: Number(button.dataset.year) }); }
    else if (button.id === 'previous') { vscode.postMessage({ type: 'month', year: month === 1 ? year - 1 : year, month: month === 1 ? 12 : month - 1 }); }
    else if (button.id === 'next') { vscode.postMessage({ type: 'month', year: month === 12 ? year + 1 : year, month: month === 12 ? 1 : month + 1 }); }
    else if (button.id === 'today') { vscode.postMessage({ type: 'today' }); }
});
`;
