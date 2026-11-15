/**
 * Keys of tasks (`#acme:12`, `:12`; docs/specs/2026-11-13-scopes-keys-plans.md):
 * counted over the whole journal as in the extension, by journal-core.
 */
import path from "node:path";

import { keyOf, nextKey, scopeOf, withKey } from "journal-core";

import type { Config } from "./config.js";
import { listFiles } from "./files.js";
import type { Scopes } from "./scopes.js";
import type { JournalStore } from "./store.js";

/** The scope a name stands for (as named, case ignored); undefined for none. For journal-core's `scopeOf`, `withKey`, … */
export const scopeNameIn = (scopes: Scopes) => (name: string) => scopes.get(name)?.name;

/** Every journal file below the journal base and the scope root; listed after the sync, so files just pulled count too. */
export function journalFiles(cfg: Config, store: JournalStore, scopes: Scopes): Promise<string[]> {
  const ext = `.${cfg.journal.getFileExtension()}`;
  return store.synced(async () => {
    const found = new Set<string>();
    for (const folder of new Set([cfg.basePath, scopes.root()])) {
      for (const file of await listFiles(folder, ext)) found.add(path.join(folder, file));
    }
    return [...found];
  });
}

/** The texts of every journal file. */
async function journalTexts(cfg: Config, store: JournalStore, scopes: Scopes): Promise<string[]> {
  return (await store.readFiles(await journalFiles(cfg, store, scopes))).filter((text): text is string => text !== undefined);
}

/**
 * The text of a task with its key, if it names a scope (`#acme call` →
 * `#acme:12 call`); `scope` names one for it. Returns the text unchanged
 * without a scope.
 */
export async function keyedTask(cfg: Config, store: JournalStore, scopes: Scopes, text: string, scope?: string): Promise<string> {
  const scopeName = scopeNameIn(scopes);
  let task = text.trim();
  if (scope !== undefined) {
    const named = scopes.get(scope.replace(/^#/, ""));
    if (!named) throw new Error(`Unknown scope '${scope}'. Create it with create_scope or check list_scopes.`);
    if (scopeOf(task, scopeName)?.toLowerCase() !== named.name.toLowerCase()) task = `#${named.name} ${task}`;
  }
  const found = scopeOf(task, scopeName);
  // a task with its key already needs no look at the journal
  if (found === undefined || keyOf(task, scopeName)) return task;
  return withKey(task, nextKey(await journalTexts(cfg, store, scopes), found), scopeName);
}
