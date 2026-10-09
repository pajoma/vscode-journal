import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Config } from "./config.js";
import { parseIsoDate } from "./dates.js";
import { Git } from "./git.js";
import { fromLines, type Lines, newEntry, toLines } from "./journal.js";

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

  /** Clients only pass dates; paths are derived here and never leave the repository. */
  private async locate(date: string): Promise<string> {
    const { year, month, day } = parseIsoDate(date);
    const dir = path.posix.join(this.cfg.basePath, year, month);
    const candidates = [`${dir}/${date}.md`, `${dir}/${day}.md`];
    for (const rel of candidates) {
      if (await exists(this.absolute(rel))) return rel;
    }
    return candidates[0];
  }

  private absolute(rel: string): string {
    const file = path.resolve(this.cfg.repoPath, rel);
    if (!file.startsWith(this.cfg.repoPath + path.sep)) {
      throw new Error("Resolved path is outside the journal repository");
    }
    return file;
  }

  private async load(date: string): Promise<Entry> {
    const rel = await this.locate(date);
    const file = this.absolute(rel);
    if (!(await exists(file))) return { date, path: rel, exists: false, lines: [] };
    return { date, path: rel, exists: true, lines: toLines(await readFile(file, "utf8")) };
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

  /** Read-modify-write of one entry; creates it from the default template if missing. */
  modify<T>(date: string, message: string, change: (lines: Lines) => T): Promise<T & { path: string }> {
    return this.exclusive(async () => {
      await this.git?.sync(true);
      const entry = await this.load(date);
      const lines = entry.exists ? entry.lines : newEntry(date);
      const result = change(lines);

      const file = this.absolute(entry.path);
      await mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
      await writeFile(tmp, fromLines(lines), "utf8");
      await rename(tmp, file);

      await this.git?.commitAndPush(entry.path, `journal(${date}): ${message}`);
      return { ...result, path: entry.path };
    });
  }
}

export function createStore(cfg: Config): JournalStore {
  return new JournalStore(cfg, cfg.gitSync ? new Git(cfg.repoPath, cfg.gitBranch, cfg.gitSyncBin) : null);
}
