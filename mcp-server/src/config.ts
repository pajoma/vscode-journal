import os from "node:os";
import path from "node:path";

export interface Config {
  /** Absolute path of the journal's git working copy. */
  repoPath: string;
  /** Journal folder relative to repoPath ("" = repository root). */
  basePath: string;
  timezone: string;
  /** Pull/push the repository with git-sync around every access. */
  gitSync: boolean;
  gitBranch: string;
  gitSyncBin: string;
  /** Token with full access to the HTTP endpoint (unused for stdio). */
  authToken: string | undefined;
  /** Optional second token that may only add tasks, time entries and notes. */
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const repoPath = env.JOURNAL_REPO_PATH;
  if (!repoPath) {
    throw new Error("JOURNAL_REPO_PATH is not set");
  }
  const basePath = (env.JOURNAL_BASE_PATH ?? "").replace(/^\/+|\/+$/g, "");
  if (basePath.split("/").includes("..")) {
    throw new Error("JOURNAL_BASE_PATH must not contain '..'");
  }
  return {
    repoPath: path.resolve(expandHome(repoPath)),
    basePath,
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
