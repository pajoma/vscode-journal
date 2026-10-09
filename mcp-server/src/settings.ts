/**
 * vscode-journal settings in VS Code `settings.json` format (JSONC, flat
 * `"journal.<key>"` keys), with the extension's defaults and fallbacks.
 */
import { readFileSync } from "node:fs";

import { parse, type ParseError, printParseErrorCode } from "jsonc-parser";

export type TemplateName = "entry" | "weekly" | "memo" | "task";

export interface InlineTemplate {
  template: string;
  /** Line after which the template is inserted ("" = directly after the title). */
  after: string;
}

export interface JournalSettings {
  /** Raw `journal.base`; variables are resolved in config.ts. */
  base: string;
  ext: string;
  locale: string;
  entryPathPattern: string;
  entryFilePattern: string;
  weekPathPattern: string;
  weekFilePattern: string;
  template(name: TemplateName): InlineTemplate;
}

/** Defaults from the extension's package.json (contributes.configuration). */
const PACKAGE_DEFAULTS: Record<string, unknown> = {
  base: "",
  ext: "md",
  locale: "",
  patterns: {
    entries: { path: "${base}/${year}/${month}", file: "${day}.${ext}" },
    weeks: { path: "${base}/${year}", file: "week_${week}.${ext}" },
  },
  templates: [
    { name: "memo", template: "- MEMO ${localTime}: ${input}" },
    { name: "task", template: "- [] ${d:LL} - Task: ${input}", after: "## Tasks" },
    { name: "entry", template: "# ${d:dddd, MMMM DD YYYY}\n\n## Tasks\n\n## Notes\n\n" },
    { name: "weekly", template: "# Week ${week}\n\n## Tasks\n\n## Notes\n\n## Daily Entries\n\n" },
  ],
  "tpl-memo": "- MEMO: ${input}",
  "tpl-task": "- [ ] TASK: ${input}",
};

/** Hard-coded fallbacks of the extension's TemplateProvider. */
const CODE_DEFAULTS: Record<TemplateName, string> = {
  entry: "# ${localDate}\n\n",
  weekly: "# Week ${week}\n\n## Tasks\n\n## Notes\n\n## Daily Entries\n\n",
  memo: "- Memo: ${input}",
  task: "- [ ] ${input}",
};

interface PatternDefinition {
  entries?: { path?: string; file?: string };
  weeks?: { path?: string; file?: string };
}

interface TemplateDefinition {
  name?: string;
  template?: string;
  after?: string;
}

export function readSettingsFile(file: string): Record<string, unknown> {
  const errors: ParseError[] = [];
  const data: unknown = parse(readFileSync(file, "utf8"), errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new Error(`Cannot parse ${file}: ${printParseErrorCode(errors[0].error)} at offset ${errors[0].offset}`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`${file} must contain a JSON object`);
  }
  return data as Record<string, unknown>;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function journalSettings(raw: Record<string, unknown>): JournalSettings {
  // like vscode's config.get(): user value if present, otherwise the package default
  const get = <T>(key: string): T | undefined => {
    const nested = raw.journal as Record<string, unknown> | undefined;
    const value = raw[`journal.${key}`] ?? nested?.[key];
    return (value ?? PACKAGE_DEFAULTS[key]) as T | undefined;
  };
  const patterns = get<PatternDefinition>("patterns");
  const defaults = PACKAGE_DEFAULTS.patterns as Required<PatternDefinition>;
  const pattern = (kind: "entries" | "weeks", part: "path" | "file") => {
    const value = patterns?.[kind]?.[part];
    return nonEmpty(value) ? value : defaults[kind][part]!;
  };
  const locale = get<string>("locale");

  return {
    base: get<string>("base") ?? "",
    ext: get<string>("ext") || "md",
    locale: nonEmpty(locale) ? locale : "en",
    entryPathPattern: pattern("entries", "path"),
    entryFilePattern: pattern("entries", "file"),
    weekPathPattern: pattern("weeks", "path"),
    weekFilePattern: pattern("weeks", "file"),
    template(name) {
      // legacy "{content}" placeholder, as in the extension's TemplateProvider
      const normalise = (t: InlineTemplate): InlineTemplate => ({
        ...t,
        template: t.template.replace("{content}", name === "entry" || name === "weekly" ? "${localDate}" : "${input}"),
      });
      const found = get<TemplateDefinition[]>("templates")?.find((t) => t.name === name);
      if (found) {
        return normalise({ template: found.template ?? CODE_DEFAULTS[name], after: found.after ?? "" });
      }
      // legacy journal.tpl-<name> settings only apply if journal.templates has no entry
      const legacy = get<string>(`tpl-${name}`);
      if (nonEmpty(legacy)) return normalise({ template: legacy, after: get<string>(`tpl-${name}-after`) ?? "" });
      return normalise({ template: CODE_DEFAULTS[name], after: "" });
    },
  };
}
