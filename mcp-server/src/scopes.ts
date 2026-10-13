/**
 * Scopes: every sub-folder of `journal.scopeRoot` is a scope; `journal.scopes`
 * entries override or add scopes (own base, own notes pattern). What a scope
 * is and where its notes go is decided by journal-core, as in the extension
 * (#250); this module scans the folders and adds what the server needs.
 */
import { readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type moment from "moment";

import { normalizeFilename, SCOPE_NAME } from "journal-core";

import type { Config } from "./config.js";
import { replaceVariable, resolveDate } from "./template.js";

export { SCOPE_NAME };

export interface Scope {
  name: string;
  /** "folder": found below the scope root; "settings": only in journal.scopes. */
  source: "folder" | "settings";
  /** Tagged private (#private …): write-only via MCP. */
  private: boolean;
  /** Absolute folder that contains the scope's notes (the path pattern up to its first variable). */
  dir: string;
  /** Whether the notes lie inside the journal repository (otherwise not reachable via MCP). */
  inRepo: boolean;
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Content of a new note: the `note` template (`${input}` = title, `${tags}`) followed by the body. */
export function renderNote(template: string, title: string, tags: string[], body: string, time: moment.Moment): string {
  const tagLine = tags
    .map((t) => `#${t.trim().replace(/^#/, "")}`)
    .filter((t) => t.length > 1)
    .join(" ");
  let text = replaceVariable(template, "input", title.trim());
  text = replaceVariable(text, "tags", tagLine);
  text = resolveDate(text, time).trimEnd();
  return `${text}\n\n${body.replace(/\r\n/g, "\n").trim()}\n`;
}

/**
 * Link line for a note, from the `files` template (`${title}`, `${link}`).
 * `target` is the plain relative path (to detect existing links), the link
 * itself is URL-encoded per segment so spaces, "%" or ")" cannot break it.
 */
export function noteLink(
  filesTemplate: string,
  fromDir: string,
  noteFile: string,
  ext: string,
): { line: string; target: string } {
  const target = path.relative(fromDir, noteFile).split(path.sep).join("/");
  const encoded = target
    .split("/")
    .map((segment) =>
      segment === ".."
        ? segment
        : // "(" and ")" are not encoded by encodeURIComponent but end a markdown link
          encodeURIComponent(segment).replace(/\(/g, "%28").replace(/\)/g, "%29"),
    )
    .join("/");
  const title = path.basename(noteFile, `.${ext}`).replace(/_/g, " ");
  return { line: replaceVariable(replaceVariable(filesTemplate, "title", title), "link", encoded), target };
}

/** `file`, or `file` with "-2", "-3", … before the extension, whichever does not exist yet. */
export async function uniqueFile(file: string, exists: (file: string) => Promise<boolean>): Promise<string> {
  const { dir, name, ext } = path.parse(file);
  let candidate = file;
  for (let n = 2; await exists(candidate); n++) candidate = path.join(dir, `${name}-${n}${ext}`);
  return candidate;
}

export class Scopes {
  constructor(private readonly cfg: Config) {}

  /** Absolute scope root; relative to the journal base, like the extension. */
  root(): string {
    return this.cfg.journal.getScopeRoot();
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

  /** The folder that contains the scope's notes: its notes path up to the first variable. */
  private notesDir(name: string): string {
    const { journal } = this.cfg;
    const pattern = replaceVariable(journal.getNotesPathPattern(name), "homeDir", os.homedir());
    const resolved = replaceVariable(pattern, "base", journal.getBasePath(name));
    return path.resolve(this.cfg.repoPath, resolved.split("${")[0]);
  }

  /** All scopes but the default one, sorted by name; rescans the scope folders. */
  all(): Scope[] {
    const { journal } = this.cfg;
    journal.setScopeFolders(this.folders());
    return journal
      .getScopeList()
      .filter((s) => !s.isDefault && SCOPE_NAME.test(s.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => {
        const dir = this.notesDir(s.name);
        return {
          name: s.name,
          source: s.kind === "folder" ? "folder" : "settings",
          private: this.isPrivate(s.name),
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
    const { journal } = this.cfg;
    const day = date.toDate();
    const dir = journal.getResolvedNotesPath(day, scope.name).value!;
    const file = journal.getNotesFilePattern(day, normalizeFilename(title), scope.name).value!;
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
