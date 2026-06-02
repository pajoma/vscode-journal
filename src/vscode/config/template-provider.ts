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
//
'use strict';

import { HeaderTemplate, InlineTemplate, ScopedTemplate, SCOPE_DEFAULT } from '../../model';
import { isNullOrUndefined, replaceVariableValue } from '../../util';
import { resolveDate } from '../../journal/template-engine';
import { IJournalSettings } from './settings-reader';

/**
 * Resolves header and inline templates (entry, note, weekly, memo, task, file
 * link, daily link, time). Pure logic; reads template definitions and base/
 * locale through {@link IJournalSettings}.
 */
export class TemplateProvider {

    constructor(private readonly settings: IJournalSettings) { }

    private resolveScope(scopeId?: string): string {
        return (isNullOrUndefined(scopeId) || scopeId!.length === 0) ? SCOPE_DEFAULT : scopeId!;
    }

    public async getEntryTemplate(date: Date, scopeId?: string): Promise<HeaderTemplate> {
        return this.settings.loadInlineTemplate("entry", "# ${localDate}\n\n", this.resolveScope(scopeId))
            .then((sp: ScopedTemplate) => {
                // backwards compatibility, replace {content} with ${input} as default
                sp.template = sp.template.replace("{content}", "${localDate}");
                sp.value = sp.template;
                sp.value = resolveDate(sp.value, date, this.settings.getLocale());
                sp.value = replaceVariableValue("base", this.settings.getBasePath(scopeId), sp.value);
                return sp;
            });
    }

    public async getWeeklyTemplate(week: Number, scopeId?: string) {
        return this.settings.loadInlineTemplate("weekly", "# Week ${week}\n\n## Tasks\n\n## Notes\n\n## Daily Entries\n\n", this.resolveScope(scopeId))
            .then((sp: ScopedTemplate) => {
                sp.value = sp.template;
                sp.value = replaceVariableValue("week", week + "", sp.value);
                return sp;
            });
    }

    public async getNotesTemplate(scopeId?: string): Promise<HeaderTemplate> {
        let tpl: ScopedTemplate = await this.settings.loadInlineTemplate("note", "# ${input}\n${tags}\n", scopeId);
        // backwards compatibility, replace {content} with ${input} as default
        tpl.template = tpl.template.replace("{content}", "${input}");
        tpl.value = resolveDate(tpl.template, new Date(), this.settings.getLocale());
        return tpl;
    }

    public async getFileLinkInlineTemplate(scopeId?: string): Promise<InlineTemplate> {
        return this.settings.loadInlineTemplate("files", "- Link: [${title}](${link})", this.resolveScope(scopeId))
            .then((result: InlineTemplate) => {
                // backwards compatibility, replace {} with ${} (ts embedded expressions) as default
                result.template = result.template.replace("{label}", "${title}");
                result.value = result.template;
                return result;
            });
    }

    public async getMemoInlineTemplate(scopeId?: string): Promise<InlineTemplate> {
        return this.settings.loadInlineTemplate("memo", "- Memo: ${input}", this.resolveScope(scopeId))
            .then((result: InlineTemplate) => {
                // backwards compatibility, replace {} with ${} (embedded expressions) as default
                result.template = result.template.replace("{content}", "${input}");
                result.value = resolveDate(result.template, new Date(), this.settings.getLocale());
                return result;
            });
    }

    public async getTaskInlineTemplate(scopeId?: string): Promise<InlineTemplate> {
        return this.settings.loadInlineTemplate("task", "- [ ] ${input}", this.resolveScope(scopeId))
            .then((res: InlineTemplate) => {
                // backwards compatibility, replace {content} with ${input} as default
                res.template = res.template.replace("{content}", "${input}");
                res.value = resolveDate(res.template, new Date(), this.settings.getLocale());
                return res;
            });
    }

    public getTimeString(): string | undefined {
        let cv = this.settings.getTplTime();
        cv = isNullOrUndefined(cv) ? "LT" : cv;
        cv = cv!.replace("${localTime}", "LT");
        return cv;
    }

    public async getTimeStringTemplate(scopeId?: string): Promise<ScopedTemplate> {
        return this.settings.loadInlineTemplate("time", "LT", this.resolveScope(scopeId))
            .then(tpl => {
                tpl.value = resolveDate(tpl.template, new Date(), this.settings.getLocale());
                return tpl;
            });
    }

    public async getDailyLinkInlineTemplate(scopeId?: string): Promise<InlineTemplate> {
        return this.settings.loadInlineTemplate("dailyLink", "- [${weekday}, ${d:MMMM DD}](${link})", this.resolveScope(scopeId))
            .then((result: InlineTemplate) => {
                result.value = result.template;
                return result;
            });
    }
}
