// Copyright (C) 2018  Patrick Maué
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
//

/** A rule of `editor.tokenColorCustomizations.textMateRules`. */
export interface TextMateRule { scope?: string | string[]; settings?: Record<string, unknown>; }

const RED = { foreground: '#CC3300' };
const YELLOW = { foreground: '#FFFF00' };
const GREY = { foreground: '#AAAAAA' };
const ITALIC = { fontStyle: 'italic' };
const rules = (scope: string, ...settings: Record<string, unknown>[]): TextMateRule[] =>
    settings.map(s => ({ scope: `text.html.markdown.journal.${scope}`, settings: s }));

/**
 * Every rule that versions up to 1.0 wrote into the user settings, for light
 * and dark themes (from res/colors). Colors now come from the theme (#44).
 */
export const INJECTED_RULES: TextMateRule[] = [
    ...rules('task.open.bullet', RED, YELLOW),
    ...rules('task.open.marker', RED, YELLOW),
    ...rules('task.open.keyword', ITALIC),
    ...rules('task.open.text', {}, { fontStyle: 'bold' }),
    ...rules('task.completed.bullet', RED, YELLOW),
    ...rules('task.completed.marker', GREY),
    ...rules('task.completed.keyword', ITALIC),
    ...rules('task.completed.text', GREY),
    ...rules('memo.bullet', RED, YELLOW),
    ...rules('memo.keyword', ITALIC),
    ...rules('link.bullet', RED, YELLOW),
    ...rules('link.keyword', ITALIC),
    ...rules('scope', RED, YELLOW, { ...RED, fontStyle: 'bold' }, { ...YELLOW, fontStyle: 'bold' }),
];

/** Compares settings objects regardless of key order. */
function canonical(settings: Record<string, unknown> | undefined): string {
    return JSON.stringify(Object.entries(settings ?? {}).sort(([a], [b]) => a.localeCompare(b)));
}

const injected = new Set(INJECTED_RULES.map(r => `${r.scope} ${canonical(r.settings)}`));

/**
 * The user's `editor.tokenColorCustomizations` without the rules older
 * versions wrote into it. Rules the user changed and all other keys stay.
 * Returns `customizations` itself when there is nothing to remove, and
 * `undefined` when nothing is left.
 */
export function withoutInjectedRules(customizations: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    const textMateRules = customizations?.textMateRules;
    if (!Array.isArray(textMateRules)) { return customizations; }

    const kept = (textMateRules as TextMateRule[]).filter(r => !injected.has(`${r.scope} ${canonical(r.settings)}`));
    if (kept.length === textMateRules.length) { return customizations; }

    const { textMateRules: _removed, ...rest } = customizations!;
    const result = kept.length > 0 ? { ...rest, textMateRules: kept } : rest;
    return Object.keys(result).length > 0 ? result : undefined;
}
