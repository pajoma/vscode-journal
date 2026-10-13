import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);
const SYNC_INTERVAL_MS = 30_000;

export class GitError extends Error {}

export type PushResult = { pushed: true } | { pushed: false; reason: string };

/** Never leak credentials embedded in remote URLs. */
function redact(text: string): string {
  return text.replace(/(\w+:\/\/)[^@\s/]+@/g, "$1***@").trim();
}

function lastLines(text: string, count = 4): string {
  return redact(text)
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("hint:"))
    .slice(-count)
    .join(" | ");
}

/**
 * Synchronisation via git-sync (https://github.com/simonthum/git-sync):
 * fetch, fast-forward or rebase, push, never force. Our own commits carry a
 * descriptive message; git-sync only moves them. A failed rebase is aborted
 * so the working copy never stays half-rebased inside the container.
 */
export class Git {
  private lastSync = 0;
  private prepared = false;

  constructor(
    private readonly repo: string,
    private readonly branch: string,
    private readonly gitSyncBin: string,
  ) {}

  private async git(...args: string[]): Promise<string> {
    try {
      const { stdout } = await exec("git", ["-C", this.repo, ...args], { timeout: 60_000 });
      return stdout.trim();
    } catch (e) {
      const err = e as { stderr?: string; message: string };
      throw new GitError(`git ${args[0]} failed: ${redact(err.stderr || err.message)}`);
    }
  }

  /** Checks the working copy once and enlists the branch for git-sync. */
  private async prepare(): Promise<void> {
    if (this.prepared) return;
    const current = await this.git("symbolic-ref", "--short", "-q", "HEAD").catch(() => "");
    if (current !== this.branch) {
      throw new GitError(`Journal repository is on '${current || "detached HEAD"}', expected '${this.branch}'`);
    }
    await this.git("config", "--bool", `branch.${this.branch}.sync`, "true");
    await this.git("config", "--bool", `branch.${this.branch}.syncNewFiles`, "true");
    await this.git("config", `branch.${this.branch}.syncCommitMsg`, "journal-mcp: sync");
    this.prepared = true;
  }

  private async rebaseInProgress(): Promise<boolean> {
    for (const dir of ["rebase-merge", "rebase-apply"]) {
      const gitPath = await this.git("rev-parse", "--git-path", dir);
      const found = await stat(`${this.repo}/${gitPath}`).then(
        () => true,
        () => false,
      );
      if (found) return true;
    }
    return false;
  }

  private async gitSync(): Promise<void> {
    try {
      await exec(this.gitSyncBin, ["sync"], { cwd: this.repo, timeout: 120_000 });
    } catch (e) {
      const err = e as { code?: number | string; stdout?: string; stderr?: string; message: string };
      const output = `${err.stdout ?? ""}\n${err.stderr ?? ""}`.trim() || err.message;
      if (await this.rebaseInProgress()) {
        await this.git("rebase", "--abort").catch(() => undefined);
        throw new GitError(
          `Local and remote changes conflict; rebase was aborted, local commits are kept but not pushed. Resolve manually. (${lastLines(output)})`,
        );
      }
      if (err.code === 3) {
        throw new GitError(
          `GitHub not reachable or push failed, local commits will be pushed on the next sync. (${lastLines(output)})`,
        );
      }
      throw new GitError(`git-sync failed (exit ${err.code}): ${lastLines(output)}`);
    }
  }

  /**
   * git-sync auto-commits whatever it finds. If the repository looks broken
   * (e.g. edited concurrently from outside the container), it could commit the
   * whole tree as a new root commit, so refuse before it runs.
   */
  private async checkConsistent(): Promise<void> {
    const head = await this.git("rev-parse", "--verify", "-q", "HEAD").catch(() => "");
    if (!head) {
      throw new GitError(
        "Journal repository has no HEAD commit (unborn or inconsistent). Nothing was synced or written.",
      );
    }
    const remote = await this.git("config", "--get", `branch.${this.branch}.remote`).catch(() => "");
    if (!remote) throw new GitError(`Branch '${this.branch}' has no upstream configured`);
    const tracking = await this.git("rev-parse", "--verify", "-q", `refs/remotes/${remote}/${this.branch}`).catch(
      () => "",
    );
    if (tracking && !(await this.git("merge-base", "HEAD", tracking).catch(() => ""))) {
      throw new GitError(
        "Local history shares no commit with the remote (inconsistent repository). Nothing was synced or written.",
      );
    }
  }

  /** Pull and push via git-sync; throttled unless forced. */
  async sync(force = false): Promise<void> {
    if (!force && Date.now() - this.lastSync < SYNC_INTERVAL_MS) return;
    await this.prepare();
    await this.checkConsistent();
    await this.gitSync();
    this.lastSync = Date.now();
  }

  /**
   * Commits only the touched files with a descriptive message, then lets
   * git-sync push them. Once committed, the change is saved: a failed push is
   * reported, not thrown, so callers do not retry and write it twice. The commit
   * is pushed by the next successful sync.
   */
  async commitAndPush(files: string[], message: string): Promise<PushResult> {
    await this.git("add", "--", ...files);
    const staged = await this.git("diff", "--cached", "--name-only", "--", ...files);
    if (staged) await this.git("commit", "--quiet", "-m", message, "--", ...files);
    try {
      await this.sync(true);
      return { pushed: true };
    } catch (e) {
      return { pushed: false, reason: (e as Error).message };
    }
  }
}
