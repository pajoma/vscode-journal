/**
 * Scopes: every sub-folder of `journal.scopeRoot` is a scope; `journal.scopes`
 * entries override or add scopes (own base, own notes pattern).
 */
import { readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type moment from "moment";

import type { Config } from "./config.js";
import type { PathPattern } from "./settings.js";
import { replaceVariable, resolveDate } from "./template.js";

export const SCOPE_NAME = /^[A-Za-z0-9_-]+$/;

export interface Scope {
  name: string;
  /** "folder": found below the scope root; "settings": only in journal.scopes. */
  source: "folder" | "settings";
  /** Tagged private (#private …): write-only via MCP. */
  private: boolean;
  /** Raw notes path/file pattern of the scope. */
  notes: PathPattern;
  /** Absolute folder that contains the scope's notes (the path pattern up to its first variable). */
  dir: string;
  /** Whether the notes lie inside the journal repository (otherwise not reachable via MCP). */
  inRepo: boolean;
}

/** Normalised file name for a note title, as the extension's normalizeFilename(). */
export function normalizeFilename(input: string): string {
  return input
    .trim()
    .replace(/\s/g, "_")
    .replace(/\\|\/|<|>|:|\n|\||\?|\*/g, "-");
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export class Scopes {
  constructor(private readonly cfg: Config) {}

  /** A base like the extension resolves it; relative bases are relative to the repository. */
  private resolveBase(base: string | undefined): string {
    if (!base) return this.cfg.basePath;
    const value = base
      .replace("${homeDir}", os.homedir())
      .replace("${workspaceRoot}", this.cfg.repoPath)
      .replace("${workspaceFolder}", this.cfg.repoPath)
      .replace(/^~(?=$|\/)/, os.homedir());
    return path.resolve(this.cfg.repoPath, value);
  }

  private fill(pattern: string, base: string, date?: moment.Moment): string {
    let value = replaceVariable(pattern, "homeDir", os.homedir());
    value = replaceVariable(value, "base", base);
    value = replaceVariable(value, "ext", this.cfg.journal.ext);
    return date ? resolveDate(value, date) : value;
  }

  /** Absolute scope root. */
  root(): string {
    return path.resolve(this.cfg.repoPath, this.fill(this.cfg.journal.scopeRoot, this.cfg.basePath));
  }

  private isPrivate(name: string): boolean {
    return this.cfg.privateTags.includes(name.toLowerCase());
  }

  private folders(): string[] {
    try {
      return readdirSync(this.root(), { withFileTypes: true })
        .filter((d) => d.isDirectory() && SCOPE_NAME.test(d.name))
        .map((d) => d.name);
    } catch {
      return [];
    }
  }

  all(): Scope[] {
    const { journal } = this.cfg;
    const folders = this.folders();
    const configured = new Map(journal.scopes.filter((s) => SCOPE_NAME.test(s.name)).map((s) => [s.name, s]));
    const names = [...new Set([...folders, ...configured.keys()])].sort((a, b) => a.localeCompare(b));
    return names.map((name) => {
      const def = configured.get(name);
      const isFolder = folders.includes(name);
      const base = this.resolveBase(def?.base);
      // folder scopes keep their notes in their folder; configured-only scopes behave like the extension
      const notes: PathPattern = {
        path: def?.notes?.path || (isFolder ? path.join(this.root(), name) : journal.notesPattern.path),
        file: def?.notes?.file || "${input}.${ext}",
      };
      const resolved = this.fill(notes.path, base);
      const dir = path.resolve(this.cfg.repoPath, resolved.split("${")[0]);
      return {
        name,
        source: isFolder ? "folder" : "settings",
        private: this.isPrivate(name),
        notes,
        dir,
        inRepo: isInside(dir, this.cfg.repoPath),
      };
    });
  }

  get(name: string): Scope | undefined {
    const wanted = name.replace(/^#/, "").toLowerCase();
    return this.all().find((s) => s.name.toLowerCase() === wanted);
  }

  /** Absolute path of a new note in the scope. */
  notePath(scope: Scope, title: string, date: moment.Moment): string {
    const base = this.resolveBase(this.cfg.journal.scopes.find((s) => s.name === scope.name)?.base);
    const dir = this.fill(scope.notes.path, base, date);
    const file = this.fill(replaceVariable(scope.notes.file, "input", normalizeFilename(title)), base, date);
    return path.resolve(this.cfg.repoPath, dir, file);
  }

  /** Absolute path of an existing note, given relative to the scope folder; never leaves it. */
  resolveNote(scope: Scope, note: string): string {
    const file = path.resolve(scope.dir, note);
    if (!isInside(file, scope.dir) || file === scope.dir) {
      throw new Error(`Note '${note}' is not inside scope '${scope.name}'`);
    }
    return file;
  }
}
