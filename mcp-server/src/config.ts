import os from "node:os";
import path from "node:path";

import { JournalConfiguration, SettingsWithDefaults } from "journal-core";

import { isInside } from "./paths.js";
import { journalValues, readSettingsFile } from "./settings.js";

export interface Config {
  /** Absolute path of the journal's git working copy. */
  repoPath: string;
  /** Absolute journal base (`journal.base`), inside repoPath. */
  basePath: string;
  /** The journal configuration as the extension resolves it (patterns, templates, scopes, locale). */
  journal: JournalConfiguration;
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

/**
 * Repository and journal base. journal.base is resolved by journal-core like
 * in the extension, with the repository as workspace (${workspaceRoot}, and
 * relative bases are relative to it); an empty base is the repository itself.
 */
function resolvePaths(
  values: Record<string, unknown>,
  repoEnv: string | undefined,
): { repoPath: string; basePath: string; journal: JournalConfiguration } {
  const repo = repoEnv ? path.resolve(expandHome(repoEnv)) : undefined;
  const base = typeof values.base === "string" && values.base.length > 0 ? values.base : repo;
  // without JOURNAL_REPO_PATH the base is the repository; the closure reads it once it is known
  let repoPath = repo ?? "";
  const journal = new JournalConfiguration(new SettingsWithDefaults({ ...values, base }), {
    language: "en",
    workspaceRoot: () => repoPath,
  });
  const basePath = journal.getBasePath();
  if (!path.isAbsolute(basePath)) throw new Error("A relative journal.base needs JOURNAL_REPO_PATH");
  repoPath = repo ?? basePath;
  if (!isInside(basePath, repoPath)) {
    throw new Error(`journal.base (${basePath}) must be inside JOURNAL_REPO_PATH (${repoPath})`);
  }
  return { repoPath, basePath, journal };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const values = journalValues(env.JOURNAL_SETTINGS ? readSettingsFile(expandHome(env.JOURNAL_SETTINGS)) : {});
  return {
    ...resolvePaths(values, env.JOURNAL_REPO_PATH),
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
