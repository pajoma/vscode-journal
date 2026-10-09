import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { Config } from "./config.js";
import { addDays, parseIsoDate } from "./dates.js";
import { Git } from "./git.js";
import { fromLines, type Lines, newEntry, toLines } from "./journal.js";
import { dayMoment, replaceVariable, resolveDate } from "./template.js";

/** Daily entries (one file per day) or weekly entries (one file per week). */
export type Period = "daily" | "weekly";

export interface EntryId {
  period: Period;
  /** The day, or any day of the week for weekly entries (YYYY-MM-DD). */
  date: string;
}

export interface Entry {
  period: Period;
  /** "2026-10-09" for daily entries, "2026-W41" for weekly entries. */
  label: string;
  /** First day of the entry (the day itself, or the first day of the week). */
  date: string;
  /** Path relative to the repository root. */
  path: string;
  exists: boolean;
  lines: Lines;
}

async function exists(file: string): Promise<boolean> {
  return stat(file).then(
    (s) => s.isFile(),
    () => false,
  );
}

/**
 * File access for daily and weekly entries. All operations run one at a time,
 * so concurrent tool calls cannot interleave reads, writes and git syncs.
 */
export class JournalStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly cfg: Config,
    private readonly git: Git | null,
  ) {}

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Week number and week-year as the extension computes them (moment's
   * locale-aware week(), journal.locale), plus the first day of that week.
   */
  week(date: string): { week: number; year: number; start: string } {
    parseIsoDate(date);
    const day = dayMoment(date, this.cfg.journal.locale);
    return { week: day.week(), year: day.weekYear(), start: day.clone().startOf("week").format("YYYY-MM-DD") };
  }

  /** Same entry, shifted by whole days (daily) or weeks (weekly). */
  shift(id: EntryId, steps: number): EntryId {
    return { period: id.period, date: addDays(id.date, steps * (id.period === "weekly" ? 7 : 1)) };
  }

  label(id: EntryId): string {
    if (id.period === "daily") return id.date;
    const { week, year } = this.week(id.date);
    return `${year}-W${String(week).padStart(2, "0")}`;
  }

  /** The entry's first day as moment, plus the ${year}/${week} values for weekly patterns. */
  private context(id: EntryId) {
    const locale = this.cfg.journal.locale;
    if (id.period === "daily") {
      parseIsoDate(id.date);
      return { moment: dayMoment(id.date, locale), week: undefined };
    }
    const w = this.week(id.date);
    return { moment: dayMoment(w.start, locale), week: w };
  }

  /**
   * Path from `journal.patterns.entries` / `.weeks` like the extension resolves
   * it. Clients only pass dates; the result must stay inside the repository.
   */
  entryPath(id: EntryId): string {
    const { journal } = this.cfg;
    const { moment, week } = this.context(id);
    const daily = id.period === "daily";
    const fill = (pattern: string) => {
      let value = replaceVariable(pattern, "homeDir", os.homedir());
      value = replaceVariable(value, "base", this.cfg.basePath);
      value = replaceVariable(value, "ext", journal.ext);
      if (week) {
        // the week-year, not the calendar year of today as in the extension (wrong around new year)
        value = replaceVariable(value, "year", String(week.year));
        value = replaceVariable(value, "week", String(week.week));
      }
      return resolveDate(value, moment);
    };
    const dir = fill(daily ? journal.entryPathPattern : journal.weekPathPattern);
    const file = fill(daily ? journal.entryFilePattern : journal.weekFilePattern);
    const absolute = path.resolve(this.cfg.basePath, dir, file);
    const rel = path.relative(this.cfg.repoPath, absolute);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error("Entry path resolves outside the journal repository, check journal.patterns");
    }
    return rel.split(path.sep).join("/");
  }

  private template(id: EntryId): Lines {
    const { journal } = this.cfg;
    const { moment, week } = this.context(id);
    let content = journal.template(id.period === "daily" ? "entry" : "weekly").template;
    content = replaceVariable(content, "base", this.cfg.basePath);
    if (week) content = replaceVariable(content, "week", String(week.week));
    return newEntry(resolveDate(content, moment));
  }

  private async load(id: EntryId): Promise<Entry> {
    const rel = this.entryPath(id);
    const file = path.join(this.cfg.repoPath, rel);
    const base = {
      period: id.period,
      label: this.label(id),
      date: id.period === "daily" ? id.date : this.week(id.date).start,
      path: rel,
    };
    if (!(await exists(file))) return { ...base, exists: false, lines: [] };
    return { ...base, exists: true, lines: toLines(await readFile(file, "utf8")) };
  }

  read(id: EntryId): Promise<Entry> {
    return this.exclusive(async () => {
      await this.git?.sync();
      return this.load(id);
    });
  }

  /** Reads several entries; duplicates (e.g. days of the same week) are read once. */
  readMany(ids: EntryId[]): Promise<Entry[]> {
    return this.exclusive(async () => {
      await this.git?.sync();
      const unique = [...new Map(ids.map((id) => [this.entryPath(id), id])).values()];
      return Promise.all(unique.map((id) => this.load(id)));
    });
  }

  /** Read-modify-write of one entry; creates it from its template if missing. */
  modify<T extends object>(
    id: EntryId,
    message: string,
    change: (lines: Lines) => T,
  ): Promise<T & Synced & { path: string }> {
    return this.modifyMany([id], message, ([lines]) => change(lines)).then((result) => ({
      ...result,
      path: this.entryPath(id),
    }));
  }

  /**
   * Changes several entries at once (passed to `change` in the order of `ids`);
   * changed files are committed together. A failed push after the commit is
   * reported as `sync` in the result; the change itself is saved.
   */
  modifyMany<T extends object>(ids: EntryId[], message: string, change: (entries: Lines[]) => T): Promise<T & Synced> {
    return this.exclusive(async () => {
      await this.git?.sync(true);
      const paths = ids.map((id) => this.entryPath(id));
      if (new Set(paths).size !== paths.length) throw new Error("Source and target are the same entry");
      const loaded = await Promise.all(ids.map((id) => this.load(id)));
      const entries = loaded.map((e, i) => (e.exists ? e.lines : this.template(ids[i])));
      const before = loaded.map((e) => (e.exists ? fromLines(e.lines) : undefined));
      const result = change(entries);

      const written: string[] = [];
      for (const [i, entry] of loaded.entries()) {
        const text = fromLines(entries[i]);
        if (text === before[i]) continue;
        const file = path.join(this.cfg.repoPath, entry.path);
        await mkdir(path.dirname(file), { recursive: true });
        const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
        await writeFile(tmp, text, "utf8");
        await rename(tmp, file);
        written.push(entry.path);
      }

      if (written.length > 0) {
        const labels = loaded.map((e) => e.label).join(", ");
        const push = await this.git?.commitAndPush(written, `journal(${labels}): ${message}`);
        if (push && !push.pushed) return { ...result, sync: { saved: true, pushed: false, reason: push.reason } };
      }
      return result;
    });
  }
}

/** Present when a change was saved and committed but could not be pushed yet. */
export interface Synced {
  sync?: { saved: true; pushed: false; reason: string };
}

export function createStore(cfg: Config): JournalStore {
  return new JournalStore(cfg, cfg.gitSync ? new Git(cfg.repoPath, cfg.gitBranch, cfg.gitSyncBin) : null);
}
