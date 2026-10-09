/**
 * vscode-journal settings in VS Code `settings.json` format (JSONC, flat
 * `"journal.<key>"` keys), with the extension's defaults and fallbacks.
 */
import { readFileSync } from "node:fs";

import { parse, type ParseError, printParseErrorCode } from "jsonc-parser";

export type TemplateName = "entry" | "weekly" | "memo" | "task" | "note" | "files";

export interface InlineTemplate {
  template: string;
  /** Line after which the template is inserted ("" = directly after the title). */
  after: string;
}

export interface PathPattern {
  path: string;
  file: string;
}

/** One entry of `journal.scopes`; `base` sits at the top level, as the extension reads it. */
export interface ScopeDefinition {
  name: string;
  base?: string;
  notes?: Partial<PathPattern>;
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
  /** Global `journal.patterns.notes`, used by configured scopes without own notes pattern. */
  notesPattern: PathPattern;
  /** Raw `journal.scopeRoot` (folder whose sub-folders are scopes). */
  scopeRoot: string;
  /** Configured scopes from `journal.scopes`. */
  scopes: ScopeDefinition[];
  /** Template, looked up in the scope's own templates first (like the extension). */
  template(name: TemplateName, scope?: string): InlineTemplate;
}

/** Defaults from the extension's package.json (contributes.configuration). */
const PACKAGE_DEFAULTS: Record<string, unknown> = {
  base: "",
  ext: "md",
  locale: "",
  scopeRoot: "${base}/scopes",
  scopes: [],
  patterns: {
    notes: { path: "${base}/${year}/${month}/${day}", file: "${input}.${ext}" },
    entries: { path: "${base}/${year}/${month}", file: "${day}.${ext}" },
    weeks: { path: "${base}/${year}", file: "week_${week}.${ext}" },
  },
  templates: [
    { name: "memo", template: "- MEMO ${localTime}: ${input}" },
    { name: "task", template: "- [] ${d:LL} - Task: ${input}", after: "## Tasks" },
    { name: "entry", template: "# ${d:dddd, MMMM DD YYYY}\n\n## Tasks\n\n## Notes\n\n" },
    { name: "note", template: "# ${input}\n\n${tags}\n" },
    { name: "files", template: "- NOTE: [${title}](${link})", after: "## Notes" },
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
  note: "# ${input}\n${tags}\n",
  files: "- Link: [${title}](${link})",
};

/** Legacy placeholders, as replaced by the extension's TemplateProvider. */
const LEGACY_PLACEHOLDERS: Partial<Record<TemplateName, [string, string]>> = {
  entry: ["{content}", "${localDate}"],
  memo: ["{content}", "${input}"],
  task: ["{content}", "${input}"],
  note: ["{content}", "${input}"],
  files: ["{label}", "${title}"],
};

type PatternKind = "notes" | "entries" | "weeks";
type PatternDefinition = Partial<Record<PatternKind, Partial<PathPattern>>>;

interface TemplateDefinition {
  name?: string;
  template?: string;
  after?: string;
}

interface RawScope {
  name?: unknown;
  base?: unknown;
  patterns?: PatternDefinition;
  templates?: TemplateDefinition[];
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
  const pattern = (kind: PatternKind, part: keyof PathPattern) => {
    const value = patterns?.[kind]?.[part];
    return nonEmpty(value) ? value : defaults[kind][part]!;
  };
  const locale = get<string>("locale");
  // the package default of journal.scopes is "{}" although an array is expected
  const rawScopes = (Array.isArray(get("scopes")) ? get<RawScope[]>("scopes")! : []).filter((s) => nonEmpty(s?.name));

  const find = (list: TemplateDefinition[] | undefined, name: TemplateName) => list?.find((t) => t.name === name);

  return {
    base: get<string>("base") ?? "",
    ext: get<string>("ext") || "md",
    locale: nonEmpty(locale) ? locale : "en",
    entryPathPattern: pattern("entries", "path"),
    entryFilePattern: pattern("entries", "file"),
    weekPathPattern: pattern("weeks", "path"),
    weekFilePattern: pattern("weeks", "file"),
    notesPattern: { path: pattern("notes", "path"), file: pattern("notes", "file") },
    scopeRoot: get<string>("scopeRoot") || (PACKAGE_DEFAULTS.scopeRoot as string),
    scopes: rawScopes.map((s) => ({
      name: s.name as string,
      base: nonEmpty(s.base) ? s.base : undefined,
      notes: s.patterns?.notes,
    })),
    template(name, scope) {
      const legacy = LEGACY_PLACEHOLDERS[name];
      const normalise = (t: InlineTemplate): InlineTemplate =>
        legacy ? { ...t, template: t.template.replace(legacy[0], legacy[1]) } : t;
      const scoped = find(rawScopes.find((s) => s.name === scope)?.templates, name);
      const found = scoped ?? find(get<TemplateDefinition[]>("templates"), name);
      if (found) {
        return normalise({ template: found.template ?? CODE_DEFAULTS[name], after: found.after ?? "" });
      }
      // legacy journal.tpl-<name> settings only apply if journal.templates has no entry
      const tpl = get<string>(`tpl-${name}`);
      if (nonEmpty(tpl)) return normalise({ template: tpl, after: get<string>(`tpl-${name}-after`) ?? "" });
      return normalise({ template: CODE_DEFAULTS[name], after: "" });
    },
  };
}
