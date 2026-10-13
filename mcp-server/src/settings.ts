/**
 * vscode-journal settings in VS Code `settings.json` format (JSONC, flat
 * `"journal.<key>"` keys or a nested `"journal"` object). Defaults, scopes,
 * paths and templates are resolved by journal-core, like in the extension (#250).
 */
import { readFileSync } from "node:fs";

import { parse, type ParseError, printParseErrorCode } from "jsonc-parser";

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

/** The `journal.*` values of a settings object, keys without the prefix; flat keys win over the nested object. */
export function journalValues(raw: Record<string, unknown>): Record<string, unknown> {
  const nested = raw.journal;
  const values: Record<string, unknown> =
    typeof nested === "object" && nested !== null && !Array.isArray(nested) ? { ...nested } : {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("journal.")) values[key.slice("journal.".length)] = value;
  }
  return values;
}
