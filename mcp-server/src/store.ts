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
  modify<T>(id: EntryId, message: string, change: (lines: Lines) => T): Promise<T & { path: string }> {
    return this.modifyMany([id], message, ([lines]) => change(lines)).then((result) => ({
      ...result,
      path: this.entryPath(id),
    }));
  }

  /**
   * Changes several entries at once (passed to `change` in the order of `ids`);
   * changed files are committed together.
   */
  modifyMany<T>(ids: EntryId[], message: string, change: (entries: Lines[]) => T): Promise<T> {
    const paths = ids.map((id) => this.entryPath(id));
    if (new Set(paths).size !== paths.length) return Promise.reject(new Error("Source and target are the same entry"));
    return this.transaction(ids.map((id) => this.label(id)).join(", "), message, async (tx) =>
      change(await Promise.all(ids.map((id) => tx.entry(id)))),
    );
  }

  /** Reads a file inside the repository (e.g. a scoped note); undefined if missing. */
  async readFile(absolute: string): Promise<string | undefined> {
    return (await this.readFiles([absolute]))[0];
  }

  /** Reads several files inside the repository after one sync; undefined for missing files. */
  readFiles(absolutes: string[]): Promise<(string | undefined)[]> {
    return this.exclusive(async () => {
      await this.git?.sync();
      return Promise.all(absolutes.map((a) => this.readRaw(this.relative(a))));
    });
  }

  /** Runs after a sync, so listings (e.g. notes of a scope) see the current remote state. */
  synced<T>(task: () => Promise<T> | T): Promise<T> {
    return this.exclusive(async () => {
      await this.git?.sync();
      return task();
    });
  }

  /**
   * Read-modify-write of entries and other repository files (scoped notes);
   * all changed files are written and committed together.
   */
  transaction<T>(label: string, message: string, change: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.exclusive(async () => {
      await this.git?.sync(true);
      const tx = new Transaction({
        entryPath: (id) => this.entryPath(id),
        relative: (absolute) => this.relative(absolute),
        read: (rel) => this.readRaw(rel),
        loadEntry: (id) => this.loadEntry(id),
      });
      const result = await change(tx);
      const written: string[] = [];
      for (const [rel, file] of tx.changes()) {
        await this.writeRaw(rel, file);
        written.push(rel);
      }
      if (written.length > 0) await this.git?.commitAndPush(written, `journal(${label}): ${message}`);
      return result;
    });
  }

  /** Repository-relative path; refuses anything outside the repository. */
  relative(absolute: string): string {
    const rel = path.relative(this.cfg.repoPath, path.resolve(this.cfg.repoPath, absolute));
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error("Path is outside the journal repository");
    }
    return rel.split(path.sep).join("/");
  }

  private async readRaw(rel: string): Promise<string | undefined> {
    const file = path.join(this.cfg.repoPath, rel);
    return (await exists(file)) ? readFile(file, "utf8") : undefined;
  }

  private async writeRaw(rel: string, text: string): Promise<void> {
    const file = path.join(this.cfg.repoPath, rel);
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
    await writeFile(tmp, text, "utf8");
    await rename(tmp, file);
  }

  private async loadEntry(id: EntryId): Promise<{ entry: Entry; lines: Lines }> {
    const entry = await this.load(id);
    return { entry, lines: entry.exists ? entry.lines : this.template(id) };
  }
}

/** What a transaction may use of the store; keeps the store's raw file access private. */
interface StoreAccess {
  entryPath(id: EntryId): string;
  relative(absolute: string): string;
  read(rel: string): Promise<string | undefined>;
  loadEntry(id: EntryId): Promise<{ entry: Entry; lines: Lines }>;
}

/** Pending changes of one store transaction. */
export class Transaction {
  private readonly entries = new Map<string, { lines: Lines; before?: string }>();
  private readonly files = new Map<string, { text: string; before?: string }>();

  constructor(private readonly store: StoreAccess) {}

  /** Lines of an entry (from its template if missing); edits are written on commit. */
  async entry(id: EntryId): Promise<Lines> {
    const rel = this.store.entryPath(id);
    const known = this.entries.get(rel);
    if (known) return known.lines;
    const { entry, lines } = await this.store.loadEntry(id);
    this.entries.set(rel, { lines, before: entry.exists ? fromLines(entry.lines) : undefined });
    return lines;
  }

  async read(absolute: string): Promise<string | undefined> {
    const rel = this.store.relative(absolute);
    return this.files.get(rel)?.text ?? (await this.store.read(rel));
  }

  async write(absolute: string, text: string): Promise<string> {
    const rel = this.store.relative(absolute);
    const before = this.files.has(rel) ? this.files.get(rel)!.before : await this.store.read(rel);
    this.files.set(rel, { text, before });
    return rel;
  }

  /** @internal Changed files (repository-relative path → new content). */
  *changes(): Generator<[string, string]> {
    for (const [rel, e] of this.entries) {
      const text = fromLines(e.lines);
      if (text !== e.before) yield [rel, text];
    }
    for (const [rel, f] of this.files) if (f.text !== f.before) yield [rel, f.text];
  }
}

export function createStore(cfg: Config): JournalStore {
  return new JournalStore(cfg, cfg.gitSync ? new Git(cfg.repoPath, cfg.gitBranch, cfg.gitSyncBin) : null);
}
