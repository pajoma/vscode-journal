import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { Git, GitError } from "../src/git.js";

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.invalid",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.invalid",
};
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env, stdio: "pipe" }).toString();

/** Bare remote + clone with one pushed commit, and a fake git-sync that leaves a marker. */
function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), "journal-mcp-git-"));
  git(dir, "init", "-q", "--bare", "-b", "master", "remote.git");
  git(dir, "clone", "-q", "remote.git", "repo");
  const repo = path.join(dir, "repo");
  git(repo, "commit", "-q", "--allow-empty", "-m", "init");
  git(repo, "push", "-q", "origin", "master");
  const marker = path.join(dir, "git-sync-ran");
  const bin = path.join(dir, "fake-git-sync");
  writeFileSync(bin, `#!/bin/sh\ntouch "${marker}"\n`);
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
