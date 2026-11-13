/**
 * Plans of the scopes (docs/specs/2026-11-13-scopes-keys-plans.md): every task
 * with a key in the files of a scope folder. After a task with a key changed
 * in an entry, its plan item follows its latest execution, as in the
 * extension; journal-core decides how (`executions`, `planEdits`).
 */
import path from "node:path";

import moment from "moment";
import { executions, firstDayOfWeek, getEntryDayFromPath, getWeekFromPath, planEdits } from "journal-core";

import type { Config } from "./config.js";
import { listFiles } from "./files.js";
import { fromLines, toLines } from "./journal/lines.js";
import { scopeNameIn } from "./keys.js";
import { isInside } from "./paths.js";
import type { Scope, Scopes } from "./scopes.js";
import type { JournalStore } from "./store.js";

/** The entries (with their day; a weekly entry with the first day of its week) and the plan files of the journal. */
export async function journalPages(cfg: Config, store: JournalStore, scopes: Scopes) {
  const { journal } = cfg;
  const ext = `.${journal.getFileExtension()}`;
  const scoped = scopes.all().filter((s) => s.inRepo);
  const files = await store.synced(async () => {
    const found = new Set<string>();
    for (const folder of new Set([cfg.basePath, scopes.root()])) {
      for (const file of await listFiles(folder, ext)) found.add(path.join(folder, file));
    }
    return [...found];
  });
  const texts = await store.readFiles(files);
  const entries: { file: string; day: string; lines: string[] }[] = [];
  const plans: { file: string; scope: Scope; lines: string[] }[] = [];
  files.forEach((file, i) => {
    const text = texts[i];
    if (text === undefined) return;
    const lines = toLines(text);
    const scope = scoped.find((s) => isInside(file, s.dir) && file !== s.dir);
    if (scope) return void plans.push({ file, scope, lines });
    const day = getEntryDayFromPath(file, journal);
    if (day) return void entries.push({ file, day: moment(day).format("YYYY-MM-DD"), lines });
    const week = getWeekFromPath(file, journal);
    if (week) entries.push({ file, day: moment(firstDayOfWeek(week.week, week.year, journal.getLocale())).format("YYYY-MM-DD"), lines });
  });
  return { entries, plans };
}

/** Updates the plan items of the keys (`#acme:12`, lower case) to their latest execution; returns how many changed. */
export async function updatePlans(cfg: Config, store: JournalStore, scopes: Scopes, keys: ReadonlySet<string>): Promise<number> {
  if (keys.size === 0) return 0;
  const scopeName = scopeNameIn(scopes);
  const { entries, plans } = await journalPages(cfg, store, scopes);
  const executed = executions(entries, scopeName);
  const changes = plans.map((plan) => ({ plan, edits: planEdits(plan.lines, executed, scopeName, keys) })).filter((c) => c.edits.length);
  if (changes.length === 0) return 0;
  let changed = 0;
  await store.transaction("plans", "update plans", async (tx) => {
    for (const { plan, edits } of changes) {
      const text = await tx.read(plan.file);
      if (text === undefined) continue;
      const lines = toLines(text);
      for (const { line, text: next } of edits) {
        // a line changed since it was read is left alone
        if (lines[line] === plan.lines[line]) {
          lines[line] = next;
          changed++;
        }
      }
      await tx.write(plan.file, fromLines(lines));
    }
    return {};
  });
  return changed;
}
