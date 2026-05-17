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
import { Ctrl } from '../util/controller';
import { SCOPE_DEFAULT, ScopeDefinitionLite } from '../ext/conf';
import { getDateFromURIAndConfig, getWeekFromURIAndConfig } from '../util/paths';
import { Input } from '../model';
import moment = require("moment");

/** Direction of entry navigation — step backward or forward relative to the anchor. */
export type Direction = 'previous' | 'next';

/**
 * Navigation mode controlling how adjacent entries are located.
 * - `existing`: skip gaps and find the nearest entry that already exists on disk.
 * - `calendar`: step exactly one calendar day (creating the target entry if missing).
 */
export type Mode = 'existing' | 'calendar';

/** Resolved starting point for navigation: the date of the anchor entry and its active scope. */
export interface Anchor {
    date: Date;
    scope: string;
}

export function stripTime(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, days: number): Date {
    const result = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
    return result;
}

export function daysBetween(from: Date, to: Date): number {
    const a = stripTime(from).getTime();
    const b = stripTime(to).getTime();
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

/**
 * Resolve the navigation anchor from the currently active editor.
 *
 * Fallback chain:
 * 1. Parse the editor's file path via `getDateFromURIAndConfig` to extract a date.
 * 2. If parsing fails or `editor` is undefined, fall back to today's date with the default scope.
 *
 * Scope is derived by matching the file path against configured scope base directories
 * (longest prefix wins). Falls back to `SCOPE_DEFAULT` when no match is found.
 */
export async function resolveAnchor(ctrl: Ctrl, editor: vscode.TextEditor | undefined): Promise<Anchor> {
    if (!editor) {
        return { date: stripTime(new Date()), scope: SCOPE_DEFAULT };
    }
    const fsPath = editor.document.uri.fsPath;
    let date: Date;
    try {
        date = await getDateFromURIAndConfig(fsPath, ctrl.config);
        if (!date || date.toString().includes('Invalid')) { throw new Error('invalid date parsed'); }
    } catch {
        return { date: stripTime(new Date()), scope: SCOPE_DEFAULT };
    }
    const scope = resolveScopeFromPath(ctrl, fsPath);
    return { date: stripTime(date), scope };
}

function resolveScopeFromPath(ctrl: Ctrl, fsPath: string): string {
    const scopes = ctrl.config.getScopeDefinitions();
    const candidates: Array<{ scope: string; base: string }> = [];
    for (const scopeDef of scopes) {
        if (!scopeDef?.name) { continue; }
        try {
            const base = ctrl.config.getBasePath(scopeDef.name);
            if (base && base.length > 0) {
                candidates.push({ scope: scopeDef.name, base: Path.normalize(base) });
            }
        } catch {
            // ignore unresolvable scope
        }
    }
    candidates.sort((a, b) => b.base.length - a.base.length);
    const normalizedPath = Path.normalize(fsPath);
    for (const c of candidates) {
        if (normalizedPath.startsWith(c.base + Path.sep) || normalizedPath === c.base) {
            return c.scope;
        }
    }
    return SCOPE_DEFAULT;
}

/**
 * Find the date of the adjacent journal entry relative to `anchor`.
 *
 * - `calendar` mode: returns `anchor.date ± 1 day` immediately without touching the filesystem.
 * - `existing` mode: walks the journal directory tree to find the nearest entry that already
 *   exists on disk in the given `direction`. Returns `null` if no such entry is found.
 *
 * Navigation is scoped: only entries under `anchor.scope`'s base directory are considered.
 */
export async function findAdjacentEntry(
    ctrl: Ctrl,
    anchor: Anchor,
    direction: Direction,
    mode: Mode,
): Promise<Date | null> {
    if (mode === 'calendar') {
        return addDays(anchor.date, direction === 'previous' ? -1 : 1);
    }
    return walkForAdjacent(ctrl, anchor, direction);
}

async function walkForAdjacent(ctrl: Ctrl, anchor: Anchor, direction: Direction): Promise<Date | null> {
    const base = ctrl.config.getBasePath(anchor.scope === SCOPE_DEFAULT ? undefined : anchor.scope);
    if (!base) { return null; }
    const baseUri = vscode.Uri.file(Path.normalize(base));

    const yearEntries = await readDirSafe(baseUri);
    const years = yearEntries
        .filter(([name, type]) => (type & vscode.FileType.Directory) !== 0 && /^\d{4}$/.test(name))
        .map(([name]) => parseInt(name, 10))
        .sort((a, b) => direction === 'previous' ? b - a : a - b);

    const anchorYear = anchor.date.getFullYear();
    const anchorMonth = anchor.date.getMonth() + 1;
    const anchorDay = anchor.date.getDate();
    const anchorKey = anchorYear * 10000 + anchorMonth * 100 + anchorDay;

    for (const year of years) {
        if (direction === 'previous' && year > anchorYear) { continue; }
        if (direction === 'next' && year < anchorYear) { continue; }

        const yearUri = vscode.Uri.joinPath(baseUri, String(year).padStart(4, '0'));
        const monthEntries = await readDirSafe(yearUri);
        const months = monthEntries
            .filter(([name, type]) => (type & vscode.FileType.Directory) !== 0 && /^\d{2}$/.test(name))
            .map(([name]) => parseInt(name, 10))
            .sort((a, b) => direction === 'previous' ? b - a : a - b);

        for (const month of months) {
            if (year === anchorYear) {
                if (direction === 'previous' && month > anchorMonth) { continue; }
                if (direction === 'next' && month < anchorMonth) { continue; }
            }

            const monthUri = vscode.Uri.joinPath(yearUri, String(month).padStart(2, '0'));
            const dayEntries = await readDirSafe(monthUri);
            const ext = ctrl.config.getFileExtension();
            const dayFilePattern = new RegExp(`^(\\d{2})\\.${escapeRegex(ext)}$`);
            const days = dayEntries
                .filter(([name, type]) => (type & vscode.FileType.File) !== 0 && dayFilePattern.test(name))
                .map(([name]) => parseInt(name.match(dayFilePattern)![1], 10))
                .sort((a, b) => direction === 'previous' ? b - a : a - b);

            for (const day of days) {
                const key = year * 10000 + month * 100 + day;
                if (direction === 'previous' && key < anchorKey) {
                    return new Date(year, month - 1, day);
                }
                if (direction === 'next' && key > anchorKey) {
                    return new Date(year, month - 1, day);
                }
            }
        }
    }
    return null;
}

async function readDirSafe(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    try {
        return await vscode.workspace.fs.readDirectory(uri);
    } catch {
        return [];
    }
}

/**
 * When the active editor contains a weekly note, returns an `Input` with `week` set to the
 * adjacent week number (direction `'next'` adds one week, `'previous'` subtracts one).
 * Returns `undefined` when the editor is absent or the file is not a weekly note — callers
 * should fall through to daily-entry navigation.
 */
export async function getAdjacentWeekInput(
    editor: vscode.TextEditor | undefined,
    ctrl: Ctrl,
    direction: Direction,
): Promise<Input | undefined> {
    if (!editor) { return undefined; }
    const weekInfo = await getWeekFromURIAndConfig(editor.document.uri, ctrl.config);
    if (!weekInfo) { return undefined; }
    const adj = moment()
        .week(weekInfo.week)
        .weekYear(weekInfo.year)
        [direction === 'previous' ? 'subtract' : 'add'](1, 'week');
    const input = new Input();
    input.week = adj.week();
    return input;
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
