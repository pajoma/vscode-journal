import os from "node:os";
import path from "node:path";

import { journalSettings, type JournalSettings, readSettingsFile } from "./settings.js";

export interface Config {
  /** Absolute path of the journal's git working copy. */
  repoPath: string;
  /** Absolute journal base (`journal.base`), inside repoPath. */
  basePath: string;
  /** vscode-journal settings (patterns, templates, locale). */
  journal: JournalSettings;
  timezone: string;
  /** Pull/push the repository with git-sync around every access. */
  gitSync: boolean;
  gitBranch: string;
  gitSyncBin: string;
  /** Token with full access to the HTTP endpoint (unused for stdio). */
  authToken: string | undefined;
  /** Optional second token that may only add tasks, memos, time entries and notes. */
  writeToken: string | undefined;
  /** Whether note content may be returned to clients. */
  notesReadable: boolean;
  /** Tags (without "#") marking content that is never returned. */
  privateTags: string[];
  host: string;
  port: number;
}

function expandHome(p: string): string {
  return p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p;
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * journal.base like the extension: ${homeDir}, ${workspaceRoot} and
 * ${workspaceFolder} (= the repository) are resolved; a relative base is
 * relative to the repository; an empty base is the repository itself.
 */
function resolvePaths(base: string, repoEnv: string | undefined): { repoPath: string; basePath: string } {
  const repo = repoEnv ? path.resolve(expandHome(repoEnv)) : undefined;
  const resolved = expandHome(
    base
      .replace("${homeDir}", os.homedir())
      .replace("${workspaceRoot}", repo ?? "")
      .replace("${workspaceFolder}", repo ?? ""),
  );
  let basePath: string;
  if (path.isAbsolute(resolved)) {
    basePath = path.resolve(resolved);
  } else if (resolved) {
    if (!repo) throw new Error("A relative journal.base needs JOURNAL_REPO_PATH");
    basePath = path.resolve(repo, resolved);
  } else {
    basePath = repo ?? path.join(os.homedir(), "Journal");
  }
  const repoPath = repo ?? basePath;
  if (!isInside(basePath, repoPath)) {
    throw new Error(`journal.base (${basePath}) must be inside JOURNAL_REPO_PATH (${repoPath})`);
  }
  return { repoPath, basePath };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const raw = env.JOURNAL_SETTINGS ? readSettingsFile(expandHome(env.JOURNAL_SETTINGS)) : {};
  const journal = journalSettings(raw);
  return {
    ...resolvePaths(journal.base, env.JOURNAL_REPO_PATH),
    journal,
    timezone: env.JOURNAL_TIMEZONE || "Europe/Berlin",
    gitSync: env.GIT_SYNC === "true",
    gitBranch: env.GIT_BRANCH || "master",
    gitSyncBin: env.GIT_SYNC_BIN || "git-sync",
    authToken: env.MCP_AUTH_TOKEN || undefined,
    writeToken: env.MCP_WRITE_TOKEN || undefined,
    notesReadable: env.NOTES_READABLE === "true",
    // #private / #privat always apply, PRIVATE_TAGS can only add further tags
    privateTags: [
      ...new Set(
        ["private", "privat", ...(env.PRIVATE_TAGS ?? "").split(",")]
          .map((t) => t.trim().replace(/^#/, "").toLowerCase())
          .filter(Boolean),
      ),
    ],
    host: env.HOST || "127.0.0.1",
    port: Number(env.PORT || 3000),
  };
}
