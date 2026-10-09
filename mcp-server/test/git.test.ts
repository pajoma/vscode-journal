import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { loadConfig } from "../src/config.js";
import { Git, GitError } from "../src/git.js";
import { JournalStore } from "../src/store.js";

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.invalid",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.invalid",
};
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env, stdio: "pipe" }).toString();

/** Bare remote + clone with one pushed commit, and a fake git-sync that leaves a marker. */
function setup(script?: (marker: string) => string) {
  const dir = mkdtempSync(path.join(tmpdir(), "journal-mcp-git-"));
  git(dir, "init", "-q", "--bare", "-b", "master", "remote.git");
  git(dir, "clone", "-q", "remote.git", "repo");
  const repo = path.join(dir, "repo");
  // commits made by the Git class under test need an identity, CI runners have none
  git(repo, "config", "user.name", "t");
  git(repo, "config", "user.email", "t@example.invalid");
  git(repo, "commit", "-q", "--allow-empty", "-m", "init");
  git(repo, "push", "-q", "origin", "master");
  const marker = path.join(dir, "git-sync-ran");
  const bin = path.join(dir, "fake-git-sync");
  writeFileSync(bin, script ? script(marker) : `#!/bin/sh\ntouch "${marker}"\n`);
  chmodSync(bin, 0o755);
  return { repo, marker, git: new Git(repo, "master", bin) };
}

describe("git consistency guard", () => {
  it("runs git-sync on a healthy repository", async () => {
    const s = setup();
    await s.git.sync(true);
    assert.ok(existsSync(s.marker));
  });

  it("refuses when local history is unrelated to the remote", async () => {
    const s = setup();
    git(s.repo, "checkout", "-q", "--orphan", "tmp");
    git(s.repo, "commit", "-q", "--allow-empty", "-m", "orphan");
    git(s.repo, "branch", "-q", "-M", "tmp", "master");
    git(s.repo, "branch", "-q", "-u", "origin/master");
    await assert.rejects(s.git.sync(true), (e: Error) => e instanceof GitError && /shares no commit/.test(e.message));
    assert.ok(!existsSync(s.marker));
  });

  it("refuses when HEAD has no commit", async () => {
    const s = setup();
    git(s.repo, "update-ref", "-d", "refs/heads/master");
    await assert.rejects(s.git.sync(true), /no HEAD commit/);
    assert.ok(!existsSync(s.marker));
  });
});

describe("push failures after a commit", () => {
  // first git-sync run (before writing) succeeds, every later run fails like an unreachable remote
  const flaky = (marker: string) =>
    `#!/bin/sh\nif [ -f "${marker}" ]; then echo "push failed" >&2; exit 3; fi\ntouch "${marker}"\n`;

  it("keeps the commit and reports the failed push instead of throwing", async () => {
    const s = setup(flaky);
    await s.git.sync(true);
    writeFileSync(path.join(s.repo, "entry.md"), "- [ ] task\n");
    const result = await s.git.commitAndPush(["entry.md"], "add task");
    assert.equal(result.pushed, false);
    assert.match(git(s.repo, "log", "-1", "--format=%s"), /add task/);
  });

  it("returns the change as saved with sync info, so clients do not retry", async () => {
    const s = setup(flaky);
    const cfg = loadConfig({ JOURNAL_REPO_PATH: s.repo });
    const store = new JournalStore(cfg, s.git);
    const result = await store.modify({ period: "daily", date: "2026-10-09" }, "add task", (lines) => {
      lines.push("- [ ] task");
      return { ok: true };
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.sync && { saved: result.sync.saved, pushed: result.sync.pushed }, {
      saved: true,
      pushed: false,
    });
  });
});
