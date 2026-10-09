import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { Config } from "./config.js";
import { parseIsoDate } from "./dates.js";
import { Git } from "./git.js";
import { fromLines, type Lines, newEntry, toLines } from "./journal.js";
import { dayMoment, replaceVariable, resolveDate } from "./template.js";

export interface Entry {
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
 * File access for daily entries. All operations run one at a time, so
 * concurrent tool calls cannot interleave reads, writes and git syncs.
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
   * Entry path from `journal.patterns.entries` like the extension resolves it.
   * Clients only pass dates; the result must stay inside the repository.
   */
  entryPath(date: string): string {
    parseIsoDate(date);
    const { journal } = this.cfg;
    const day = dayMoment(date, journal.locale);
    let dir = replaceVariable(journal.entryPathPattern, "homeDir", os.homedir());
    dir = resolveDate(replaceVariable(dir, "base", this.cfg.basePath), day);
    const file = resolveDate(replaceVariable(journal.entryFilePattern, "ext", journal.ext), day);
    const absolute = path.resolve(this.cfg.basePath, dir, file);
    const rel = path.relative(this.cfg.repoPath, absolute);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error("Entry path resolves outside the journal repository, check journal.patterns");
    }
    return rel.split(path.sep).join("/");
  }

  private async load(date: string): Promise<Entry> {
    const rel = this.entryPath(date);
    const file = path.join(this.cfg.repoPath, rel);
    if (!(await exists(file))) return { date, path: rel, exists: false, lines: [] };
    return { date, path: rel, exists: true, lines: toLines(await readFile(file, "utf8")) };
  }

  private template(date: string): Lines {
    const { journal } = this.cfg;
    const content = replaceVariable(journal.template("entry").template, "base", this.cfg.basePath);
    return newEntry(resolveDate(content, dayMoment(date, journal.locale)));
  }

  read(date: string): Promise<Entry> {
    return this.exclusive(async () => {
      await this.git?.sync();
      return this.load(date);
    });
  }

  readMany(dates: string[]): Promise<Entry[]> {
    return this.exclusive(async () => {
      await this.git?.sync();
      return Promise.all(dates.map((d) => this.load(d)));
    });
  }

  /** Read-modify-write of one entry; creates it from the entry template if missing. */
  modify<T>(date: string, message: string, change: (lines: Lines) => T): Promise<T & { path: string }> {
    return this.modifyMany([date], message, (entries) => change(entries.get(date)!)).then((result) => ({
      ...result,
      path: this.entryPath(date),
    }));
  }

  /** Changes several entries at once; changed files are committed together. */
  modifyMany<T>(dates: string[], message: string, change: (entries: Map<string, Lines>) => T): Promise<T> {
    return this.exclusive(async () => {
      await this.git?.sync(true);
      const loaded = await Promise.all([...new Set(dates)].map((d) => this.load(d)));
      const entries = new Map(loaded.map((e) => [e.date, e.exists ? e.lines : this.template(e.date)]));
      const before = new Map(loaded.map((e) => [e.date, e.exists ? fromLines(e.lines) : undefined]));
      const result = change(entries);

      const written: string[] = [];
      for (const entry of loaded) {
        const text = fromLines(entries.get(entry.date)!);
        if (text === before.get(entry.date)) continue;
        const file = path.join(this.cfg.repoPath, entry.path);
        await mkdir(path.dirname(file), { recursive: true });
        const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
        await writeFile(tmp, text, "utf8");
        await rename(tmp, file);
        written.push(entry.path);
      }

      if (written.length > 0) {
        const label = dates.length === 1 ? dates[0] : `${dates[0]}..${dates[dates.length - 1]}`;
        await this.git?.commitAndPush(written, `journal(${label}): ${message}`);
      }
      return result;
    });
  }
}

export function createStore(cfg: Config): JournalStore {
  return new JournalStore(cfg, cfg.gitSync ? new Git(cfg.repoPath, cfg.gitBranch, cfg.gitSyncBin) : null);
}
