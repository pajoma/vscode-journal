// Copyright (C) 2016  Patrick Maué
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

import { replaceVariable, resolveDate, resolveDayOffsets } from '../template';
import { firstDayOfWeek } from '../weeks';
import { JournalSettings, JournalTemplates } from './interfaces';
import { HeaderTemplate, InlineTemplate, Resolved } from './types';

/**
 * Code fallbacks, a second layer below the manifest defaults: VS Code (and
 * SettingsWithDefaults) return `journal.templates` from SETTINGS_DEFAULTS
 * until the user sets the list. These apply only when the user's list has no
 * entry of the name and no legacy `journal.tpl-<name>` is set, which is why
 * they differ from the manifest defaults. Keep both when changing a default.
 */
export const TEMPLATE_FALLBACKS = {
    entry: '# ${localDate}\n\n',
    weekly: '# Week ${week}\n\n## Tasks\n\n## Notes\n\n## Daily Entries\n\n',
    note: '# ${input}\n${tags}\n',
    files: '- Link: [${title}](${link})',
    memo: '- Memo: ${input}',
    task: '- [ ] ${input}',
    time: 'LT',
    dailyLink: '- [[${d:YYYY-MM-DD}|${weekday}, ${d:MMMM DD}]]',
} as const;

/**
 * Resolves header and inline templates (entry, note, weekly, memo, task, file
 * link, daily link, time). `template` is the template with legacy placeholders
 * replaced, `value` the template resolved for the given (or the current) date.
 */
export class TemplateProvider implements JournalTemplates {

    constructor(private readonly settings: JournalSettings) { }

    /** The template with a legacy placeholder (`{content}`, `{label}`) replaced by its variable. */
    private template(id: keyof typeof TEMPLATE_FALLBACKS, scopeId?: string, legacy?: [string, string]): InlineTemplate {
        const tpl = this.settings.getInlineTemplate(id, TEMPLATE_FALLBACKS[id], scopeId);
        return legacy ? { ...tpl, template: tpl.template.replace(legacy[0], legacy[1]) } : tpl;
    }

    private resolveDate(value: string, date: Date = new Date()): string {
        return resolveDate(value, date, this.settings.getLocale());
    }

    public getEntryTemplate(date: Date, scopeId?: string): Resolved<HeaderTemplate> {
        const tpl = this.template('entry', scopeId, ['{content}', '${localDate}']);
        return { ...tpl, value: replaceVariable(this.resolveDate(tpl.template, date), 'base', this.settings.getBasePath(scopeId)) };
    }

    /**
     * The weekly template for a week. By default only `${week}` is resolved.
     * With `journal.weeklyTemplateDates`, `${year}` is the year the week belongs
     * to, and the other date variables and `${d+N:format}` are resolved from the
     * first day of the week (#137).
     */
    public getWeeklyTemplate(week: number, year: number, scopeId?: string): Resolved {
        const tpl = this.template('weekly', scopeId);
        let value = replaceVariable(tpl.template, 'week', String(week));
        if (this.settings.isWeeklyTemplateDates()) {
            const locale = this.settings.getLocale();
            const firstDay = firstDayOfWeek(week, year, locale);
            value = replaceVariable(value, 'year', String(year));
            value = resolveDate(resolveDayOffsets(value, firstDay, locale), firstDay, locale);
        }
        return { ...tpl, value };
    }

    public getNotesTemplate(scopeId?: string): Resolved<HeaderTemplate> {
        const tpl = this.template('note', scopeId, ['{content}', '${input}']);
        return { ...tpl, value: this.resolveDate(tpl.template) };
    }

    public getFileLinkInlineTemplate(scopeId?: string): Resolved<InlineTemplate> {
        const tpl = this.template('files', scopeId, ['{label}', '${title}']);
        return { ...tpl, value: tpl.template };
    }

    public getMemoInlineTemplate(scopeId?: string): Resolved<InlineTemplate> {
        const tpl = this.template('memo', scopeId, ['{content}', '${input}']);
        return { ...tpl, value: this.resolveDate(tpl.template) };
    }

    public getTaskInlineTemplate(scopeId?: string): Resolved<InlineTemplate> {
        const tpl = this.template('task', scopeId, ['{content}', '${input}']);
        return { ...tpl, value: this.resolveDate(tpl.template) };
    }

    public getTimeString(): string | undefined {
        return (this.settings.getTplTime() ?? 'LT').replace('${localTime}', 'LT');
    }

    public getTimeStringTemplate(scopeId?: string): Resolved {
        const tpl = this.template('time', scopeId);
        return { ...tpl, value: this.resolveDate(tpl.template) };
    }

    public getDailyLinkInlineTemplate(scopeId?: string): Resolved<InlineTemplate> {
        const tpl = this.template('dailyLink', scopeId);
        return { ...tpl, value: tpl.template };
    }
}
