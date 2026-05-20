import * as os from 'os';
import * as Path from 'path';
import { HeaderTemplate, InlineTemplate, ScopedTemplate, SCOPE_DEFAULT } from '../model';
import { replaceVariableValue, isNullOrUndefined } from '../util';
import { resolveDate } from '../journal/template-engine';

export interface IRawConfigProvider {
    getLocale(): string;
    getBasePath(scopeId?: string): string;
    getBasePathForLocalOpen(scopeId?: string): string;
    getFileExtension(scopeId?: string): string;
    getEntryPathPattern(scopeId?: string): string;
    getNotesPathPattern(scopeId?: string): string | undefined;
    getWeeklyNotesPathPatternRaw(scopeId?: string): string;
    getWeeksPathPatternRaw(scopeId?: string): string;
    getWeeksFilePatternRaw(scopeId?: string): string;
    getEntryFilePatternRaw(scopeId?: string): string;
    getNotesFilePatternRaw(scopeId?: string): string;
    getWeeklyNotesFilePatternRaw(scopeId?: string): string;
    getWeekFilePatternRaw(scopeId?: string): string;
    getWeekOrEntryPathPatternRaw(scopeId?: string): string;
    getTplTime(): string | undefined;
    loadInlineTemplate(id: string, defaultValue: string, scopeId?: string): Promise<InlineTemplate>;
}

export class TemplateService {

    constructor(private readonly raw: IRawConfigProvider) {}

    private resolveScope(scopeId?: string): string {
        return (isNullOrUndefined(scopeId) || scopeId!.length === 0) ? SCOPE_DEFAULT : scopeId!;
    }

    public async getResolvedNotesPath(date: Date, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = {
            scope: (this.resolveScope(scopeId) === SCOPE_DEFAULT) ? SCOPE_DEFAULT : scopeId!,
            template: this.raw.getNotesPathPattern(scopeId)!
        };
        scopedTemplate.value = scopedTemplate.template;
        scopedTemplate.value = replaceVariableValue("homeDir", os.homedir(), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("base", this.raw.getBasePath(scopeId), scopedTemplate.value);
        scopedTemplate.value = resolveDate(scopedTemplate.value, date, this.raw.getLocale());
        // On non-Windows hosts, eliminate any residual backslashes so that the
        // fully-resolved path is a valid POSIX path (covers WSL remote sessions).
        if (process.platform !== 'win32') {
            scopedTemplate.value = scopedTemplate.value.replace(/\\/g, '/');
        }
        return scopedTemplate;
    }

    public async getNotesFilePattern(date: Date, input: string, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = { scope: SCOPE_DEFAULT, template: "" };
        if (this.resolveScope(scopeId) !== SCOPE_DEFAULT) {
            scopedTemplate.scope = scopeId!;
        }
        scopedTemplate.template = this.raw.getNotesFilePatternRaw(scopeId);
        scopedTemplate.value = replaceVariableValue("ext", this.raw.getFileExtension(), scopedTemplate.template);
        scopedTemplate.value = replaceVariableValue("input", input, scopedTemplate.value);
        scopedTemplate.value = resolveDate(scopedTemplate.value, date, this.raw.getLocale());
        return scopedTemplate;
    }

    public async getResolvedWeeklyNotesPath(week: number, year: number, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = {
            scope: (this.resolveScope(scopeId) === SCOPE_DEFAULT) ? SCOPE_DEFAULT : scopeId!,
            template: this.raw.getWeeklyNotesPathPatternRaw(scopeId)
        };
        scopedTemplate.value = scopedTemplate.template;
        scopedTemplate.value = replaceVariableValue("homeDir", os.homedir(), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("base", this.raw.getBasePath(scopeId), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("year", String(year), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("week", String(week), scopedTemplate.value);
        if (process.platform !== 'win32') {
            scopedTemplate.value = scopedTemplate.value.replace(/\\/g, '/');
        }
        return scopedTemplate;
    }

    public async getWeeklyNotesFilePattern(week: number, year: number, input: string, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = { scope: SCOPE_DEFAULT, template: "" };
        if (this.resolveScope(scopeId) !== SCOPE_DEFAULT) {
            scopedTemplate.scope = scopeId!;
        }
        scopedTemplate.template = this.raw.getWeeklyNotesFilePatternRaw(scopeId);
        scopedTemplate.value = replaceVariableValue("ext", this.raw.getFileExtension(), scopedTemplate.template);
        scopedTemplate.value = replaceVariableValue("input", input, scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("year", String(year), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("week", String(week), scopedTemplate.value);
        return scopedTemplate;
    }

    async getWeekFilePattern(week: Number, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = { scope: SCOPE_DEFAULT, template: "" };
        if (this.resolveScope(scopeId) !== SCOPE_DEFAULT) {
            scopedTemplate.scope = scopeId!;
        }
        scopedTemplate.value = this.raw.getWeekFilePatternRaw(scopeId);
        scopedTemplate.value = replaceVariableValue("ext", this.raw.getFileExtension(), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("week", week + "", scopedTemplate.value);
        scopedTemplate.value = resolveDate(scopedTemplate.value, new Date(), this.raw.getLocale());
        return scopedTemplate;
    }

    public async getWeekPathPatternForLocalOpen(week: Number, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = { scope: SCOPE_DEFAULT, template: "" };
        if (this.resolveScope(scopeId) !== SCOPE_DEFAULT) {
            scopedTemplate.scope = scopeId!;
        }
        scopedTemplate.template = this.raw.getWeekOrEntryPathPatternRaw(scopeId);
        scopedTemplate.value = scopedTemplate.template;
        scopedTemplate.value = replaceVariableValue("base", this.raw.getBasePathForLocalOpen(scopeId), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("week", week + "", scopedTemplate.value);
        scopedTemplate.value = resolveDate(scopedTemplate.value, new Date(), this.raw.getLocale());
        return scopedTemplate;
    }

    async getWeekPathPattern(week: Number, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = { scope: SCOPE_DEFAULT, template: "" };
        if (this.resolveScope(scopeId) !== SCOPE_DEFAULT) {
            scopedTemplate.scope = scopeId!;
        }
        scopedTemplate.template = this.raw.getWeekOrEntryPathPatternRaw(scopeId);
        scopedTemplate.value = scopedTemplate.template;
        scopedTemplate.value = replaceVariableValue("base", this.raw.getBasePath(scopeId), scopedTemplate.value);
        scopedTemplate.value = replaceVariableValue("week", week + "", scopedTemplate.value);
        scopedTemplate.value = resolveDate(scopedTemplate.value, new Date(), this.raw.getLocale());
        if (process.platform !== 'win32') {
            scopedTemplate.value = scopedTemplate.value.replace(/\\/g, '/');
        }
        scopedTemplate.value = Path.normalize(scopedTemplate.value);
        return scopedTemplate;
    }

    public async getResolvedEntryPath(date: Date, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = {
            scope: (this.resolveScope(scopeId) === SCOPE_DEFAULT) ? SCOPE_DEFAULT : scopeId!,
            template: this.raw.getEntryPathPattern(scopeId)!
        };
        scopedTemplate.value = replaceVariableValue("base", this.raw.getBasePath(scopeId), scopedTemplate.template);
        scopedTemplate.value = resolveDate(scopedTemplate.value, date, this.raw.getLocale());
        // On non-Windows hosts, convert any residual backslashes to forward slashes
        // before normalization so that Windows-style base paths configured for WSL
        // remote sessions (e.g. C:\Users\...) do not produce mixed-separator paths
        // like /C:\Users\...\journal/2026/05 (see issue #228).
        if (process.platform !== 'win32') {
            scopedTemplate.value = scopedTemplate.value.replace(/\\/g, '/');
        }
        scopedTemplate.value = Path.normalize(scopedTemplate.value);
        return scopedTemplate;
    }

    public async getResolvedEntryPathForLocalOpen(date: Date, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = {
            scope: (this.resolveScope(scopeId) === SCOPE_DEFAULT) ? SCOPE_DEFAULT : scopeId!,
            template: this.raw.getEntryPathPattern(scopeId)!
        };
        scopedTemplate.value = replaceVariableValue("base", this.raw.getBasePathForLocalOpen(scopeId), scopedTemplate.template);
        scopedTemplate.value = resolveDate(scopedTemplate.value, date, this.raw.getLocale());
        // Do not use Path.normalize here — may use remote OS separators conflicting with local Windows paths.
        return scopedTemplate;
    }

    public async getEntryFilePattern(date: Date, scopeId?: string): Promise<ScopedTemplate> {
        const scopedTemplate: ScopedTemplate = { scope: SCOPE_DEFAULT, template: "" };
        if (this.resolveScope(scopeId) !== SCOPE_DEFAULT) {
            scopedTemplate.scope = scopeId!;
        }
        scopedTemplate.template = this.raw.getEntryFilePatternRaw(scopeId);
        scopedTemplate.value = replaceVariableValue("ext", this.raw.getFileExtension(scopeId), scopedTemplate.template);
        scopedTemplate.value = resolveDate(scopedTemplate.value, date, this.raw.getLocale());
        return scopedTemplate;
    }

    public async getEntryTemplate(date: Date, scopeId?: string): Promise<HeaderTemplate> {
        return this.raw.loadInlineTemplate("entry", "# ${localDate}\n\n", this.resolveScope(scopeId))
            .then((sp: ScopedTemplate) => {
                // backwards compatibility, replace {content} with ${input} as default
                sp.template = sp.template.replace("{content}", "${localDate}");
                sp.value = sp.template;
                sp.value = resolveDate(sp.value, date, this.raw.getLocale());
                sp.value = replaceVariableValue("base", this.raw.getBasePath(scopeId), sp.value);
                return sp;
            });
    }

    public async getWeeklyTemplate(week: Number, scopeId?: string) {
        return this.raw.loadInlineTemplate("weekly", "# Week ${week}\n\n## Tasks\n\n## Notes\n\n## Daily Entries\n\n", this.resolveScope(scopeId))
            .then((sp: ScopedTemplate) => {
                sp.value = sp.template;
                sp.value = replaceVariableValue("week", week + "", sp.value);
                return sp;
            });
    }

    public async getNotesTemplate(scopeId?: string): Promise<HeaderTemplate> {
        let tpl: ScopedTemplate = await this.raw.loadInlineTemplate("note", "# ${input}\n${tags}\n", scopeId);
        // backwards compatibility, replace {content} with ${input} as default
        tpl.template = tpl.template.replace("{content}", "${input}");
        tpl.value = resolveDate(tpl.template, new Date(), this.raw.getLocale());
        return tpl;
    }

    public async getFileLinkInlineTemplate(scopeId?: string): Promise<InlineTemplate> {
        return this.raw.loadInlineTemplate("files", "- Link: [${title}](${link})", this.resolveScope(scopeId))
            .then((result: InlineTemplate) => {
                // backwards compatibility, replace {} with ${} (ts embedded expressions) as default
                result.template = result.template.replace("{label}", "${title}");
                result.value = result.template;
                return result;
            });
    }

    public async getMemoInlineTemplate(scopeId?: string): Promise<InlineTemplate> {
        return this.raw.loadInlineTemplate("memo", "- Memo: ${input}", this.resolveScope(scopeId))
            .then((result: InlineTemplate) => {
                // backwards compatibility, replace {} with ${} (embedded expressions) as default
                result.template = result.template.replace("{content}", "${input}");
                result.value = resolveDate(result.template, new Date(), this.raw.getLocale());
                return result;
            });
    }

    public async getTaskInlineTemplate(scopeId?: string): Promise<InlineTemplate> {
        return this.raw.loadInlineTemplate("task", "- [ ] ${input}", this.resolveScope(scopeId))
            .then((res: InlineTemplate) => {
                // backwards compatibility, replace {content} with ${input} as default
                res.template = res.template.replace("{content}", "${input}");
                res.value = resolveDate(res.template, new Date(), this.raw.getLocale());
                return res;
            });
    }

    public getTimeString(): string | undefined {
        let cv = this.raw.getTplTime();
        cv = isNullOrUndefined(cv) ? "LT" : cv;
        cv = cv!.replace("${localTime}", "LT");
        return cv;
    }

    public async getTimeStringTemplate(scopeId?: string): Promise<ScopedTemplate> {
        return this.raw.loadInlineTemplate("time", "LT", this.resolveScope(scopeId))
            .then(tpl => {
                tpl.value = resolveDate(tpl.template, new Date(), this.raw.getLocale());
                return tpl;
            });
    }

    public async getDailyLinkInlineTemplate(scopeId?: string): Promise<InlineTemplate> {
        return this.raw.loadInlineTemplate("dailyLink", "- [${weekday}, ${d:MMMM DD}](${link})", this.resolveScope(scopeId))
            .then((result: InlineTemplate) => {
                result.value = result.template;
                return result;
            });
    }

    /** @deprecated Replaced to support live reloading */
    private async getInlineTemplateCached(id: string, defaultValue: string, scopeId: string): Promise<InlineTemplate> {
        return this.raw.loadInlineTemplate(id, defaultValue, scopeId);
    }
}
