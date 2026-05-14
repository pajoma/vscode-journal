# Issue #51 — Implementation Plan: Remote file creation error

> **Spec:** [docs/specs/2026-05-14-fix-51-remote-file-creation.md](../specs/2026-05-14-fix-51-remote-file-creation.md)
> **Issue:** [pajoma/vscode-journal#51](https://github.com/pajoma/vscode-journal/issues/51)
> **Branch:** `51-error-openingcreating-journal-files-over-remote-connection`
> **Created:** 2026-05-14

## Approach

Replace the speculative "call `openTextDocument`, catch failure, create" pattern with a deterministic "stat first, then open OR create" pattern in three methods:

1. `Reader.loadEntryForDay`
2. `Reader.loadEntryForWeek`
3. `LoadNotes.loadNote`

A small dedicated helper `fileExists(uri)` in its own module (`src/util/fs-exists.ts`) wraps `vscode.workspace.fs.stat` and converts `FileSystemError.FileNotFound` to `false`. Anything else propagates so VS Code surfaces an error dialog (permission denied, transport unavailable, etc.). No reliance on prefix-matching error messages.

While each method is rewritten, the existing `new Promise((resolve, reject) => …)` wrapper around the body is removed and the function body becomes a flat `async`/`await` sequence. This was previously out of scope but pulled in by the approval comment because the wrappers make the new linear flow noticeably harder to read.

Trade-offs:
- The diff touches three methods, one new helper file, and adds regression tests. The Promise flattening grows the diff size but keeps each method idiomatic — the alternative (leave the wrappers, just patch the body) leaves a worse code shape behind.
- The change cannot be unit-tested with mocks alone — the assertion ("no error logged on first create") needs a real `Logger` and real `vscode.workspace.fs`. Tests run in the Extension Host (already the project's convention via `@vscode/test-cli`). Remote-host verification stays manual.
- Detection technique: TDD. Write each regression test first, watch it fail on current code, refactor, watch it pass.

## Steps

### Step 1 — Branch + baseline

- Branch `51-error-openingcreating-journal-files-over-remote-connection` already checked out. Spec at commit `7d61846`.
- Run `npm install` (toolchain matches `develop` HEAD `0744437` after PR #176 plus the #170 commits merged via PR #178 on this branch — same deps as the #170 work).
- Run `npm run check`. Confirm baseline is clean before introducing the fix.

### Step 2 — Failing regression tests (TDD)

New file: `src/test/suite/issue-51-remote-create.test.ts`. Pattern matches `phase1-regression.test.ts` — real `vscode.workspace.fs`, `TestLogger` in capturing mode so the assertion "no error logged" is concrete.

Test scenarios (named) — see "Test scenarios" section below for the full plain-language list. Each test:
- Creates a unique tmp directory for the test (under `os.tmpdir()`), avoiding collision with the configured journal base.
- Constructs a real `Ctrl`, points the relevant config at the tmp path, invokes the method.
- Asserts: returned `TextDocument.uri.fsPath` matches; `getText()` contains the template header; `TestLogger.errors` is empty.
- Tears down by deleting the tmp directory via `vscode.workspace.fs.delete`.

Helper test file extension: extend `TestLogger` (in `src/test/test-logger.ts`) with an `errors: string[]` accumulator if it does not already capture `printError`/`error` calls. Inspect first; add only if missing.

Run `npm test -- --grep "#51"`. Confirm tests fail (expected: error is logged on first-time creation).

### Step 3 — Add `fileExists` helper module

New file: `src/util/fs-exists.ts`.

```typescript
import * as vscode from 'vscode';

export async function fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch (err) {
        if (err instanceof vscode.FileSystemError && err.code === 'FileNotFound') {
            return false;
        }
        throw err;
    }
}
```

Tests for the helper go in the same `issue-51-remote-create.test.ts`:
- Missing path → returns `false`, no log.
- Existing path → returns `true`.
- Re-throws non-FileNotFound (simulated by passing an invalid/inaccessible URI — exact technique TBD during impl; if a clean simulation isn't available in the test env, document this as a manual check and rely on the contract in the helper code itself).

Register the helper in `src/util/index.ts` so it is reachable via `J.Util.fileExists` (the project's namespace barrel pattern — even though new code should prefer named imports per CLAUDE.md, the existing callers in `Reader` import via `J.Util.*`, so consistency wins for this PR).

### Step 4 — Refactor `Reader.loadEntryForDay`

File: `src/actions/reader.ts` (lines 97–143).

Replace the entire `Promise<vscode.TextDocument>` body with:

```typescript
public async loadEntryForDay(date: Date): Promise<vscode.TextDocument> {
    if (J.Util.isNullOrUndefined(date) || date!.toString().includes("Invalid")) {
        throw new Error("Invalid date");
    }
    this.ctrl.logger.trace("Entering loadEntryforDate() in actions/reader.ts for date " + date.toISOString());

    const [pathname, filename] = await Promise.all([
        this.ctrl.config.getResolvedEntryPath(date),
        this.ctrl.config.getEntryFilePattern(date),
    ]);
    const path = J.Util.resolvePath(pathname.value!, filename.value!);
    const uri = vscode.Uri.file(path);

    const exists = await J.Util.fileExists(uri);
    const doc = exists
        ? await this.ctrl.ui.openDocument(path)
        : await this.ctrl.writer.createEntryForPath(path, date);

    this.ctrl.logger.debug("loadEntryForDate() - Loaded file in:", doc.uri.toString());

    // fire-and-forget link injection (preserves existing side-effect)
    new J.Provider.SyncNoteLinks(this.ctrl).injectAttachementLinks(doc, date)
        .finally(() => this.ctrl.logger.trace("Scanning notes completed"));

    return doc;
}
```

Behavioral notes:
- Removed prefix-matching catch block (`reader.ts:118–124`). With stat-first, no spurious failure can reach a catch on the happy path.
- `J.Util.fileExists` propagates non-FileNotFound errors → bubbles out of `loadEntryForDay` → caller (the smart-input command) handles. No try/catch here; the caller already wraps with its own error handling that surfaces the dialog.
- "Invalid date" branch now throws instead of resolving via reject — same observable behavior since the original caller treats both as a rejection.

### Step 5 — Refactor `Reader.loadEntryForWeek`

File: `src/actions/reader.ts` (lines 54–86).

Mirror image of step 4 (no link injection — weekly entries do not call `SyncNoteLinks`). Body becomes:

```typescript
public async loadEntryForWeek(week: Number): Promise<vscode.TextDocument> {
    this.ctrl.logger.trace("Entering loadEntryForWeek() in actions/reader.ts for week " + week);

    const [pathname, filename] = await Promise.all([
        this.ctrl.config.getWeekPathPattern(week),
        this.ctrl.config.getWeekFilePattern(week),
    ]);
    const path = J.Util.resolvePath(pathname.value!, filename.value!);
    const uri = vscode.Uri.file(path);

    const exists = await J.Util.fileExists(uri);
    const doc = exists
        ? await this.ctrl.ui.openDocument(path)
        : await this.ctrl.writer.createWeeklyForPath(path, week);

    this.ctrl.logger.debug("loadEntryForWeek() - Loaded file in:", doc.uri.toString());
    return doc;
}
```

This is the call site that previously *only* checked `cannot open file:` (not `cannot open vscode-remote:`), so it carried the loudest version of the bug on remote.

### Step 6 — Refactor `LoadNotes.loadNote`

File: `src/provider/features/load-note.ts` (lines 42–60).

```typescript
public async loadNote(path: string, content: string): Promise<vscode.TextDocument> {
    this.ctrl.logger.trace("Entering loadNote() in features/load-note.ts for path: ", path);

    const uri = vscode.Uri.file(path);
    const exists = await J.Util.fileExists(uri);
    if (exists) {
        return this.ctrl.ui.openDocument(path);
    }
    return this.ctrl.writer.createSaveLoadTextDocument(path, content);
}
```

`loadWithPath` (lines 21–32) is unchanged; it already calls `loadNote` and `loadEntryForInput` with `async/await` at the outer level.

### Step 7 — Run tests, iterate

- `npm test -- --grep "#51"` should now pass.
- `npm run check` — lint + compile + full suite must be green.
- If any unrelated test breaks (e.g. commands-entry stubs `loadEntryForInput` at the controller seam — unaffected), investigate; do not paper over.

### Step 8 — Manual verification

- Local: `F5` (Run Extension), trigger `Ctrl+Shift+J → Today` on a date with no existing file, confirm clean open, no error toast. Repeat for weekly entry and a new note.
- Remote SSH: open a workspace on a Linux host via Remote-SSH, install the dev build (sideload via `vsce package` and `code --install-extension`), repeat the three actions. Capture the OutputChannel content for the PR description as evidence.
- WSL Remote: same as SSH, on a Windows host with WSL. Same evidence.
- Pre-existing-file path: trigger `Today` after the entry is already created — confirm it opens the same document, does not overwrite.

If remote sideload is impractical (e.g. no spare remote host), substitute by manually testing against an SMB/9P-mounted directory that mimics async FS latency. Document this substitution in the PR description if used.

### Step 9 — PR + changelog

- Branch already exists. Commit history: spec (`d5c140d`) → spec amendments (`7d61846`) → plan (this doc) → tests → helper → reader refactor → notes refactor → manual evidence.
- Open PR against `develop`. Title: `fix: stat-first file creation on remote workspaces (#51)`.
- PR body links: issue, spec doc, plan doc, the OutputChannel evidence from step 8.
- Update `CHANGELOG.md` under the unreleased section with one line referencing #51.
- Update `PLAN.md` Phase 1.3 to record that the user-visible payoff landed.
- Post on the issue: "PR #Y opens — implementing approved plan." Nothing else.

## Test scenarios

### S1 — `Reader.loadEntryForDay` creates and opens, no log

**Type:** integration (Extension Host, real FS, real Logger).
**Acceptance link:** spec acceptance #1, #2 (no `[ERROR]` line).
**Setup:** tmp dir; configure journal base to it; pick a date whose computed path does not exist.
**Action:** `await ctrl.reader.loadEntryForDay(date)`.
**Assert:** returned doc exists at expected path; content includes the template header; `TestLogger.errors.length === 0`.

### S2 — `Reader.loadEntryForDay` opens existing file without overwrite

**Type:** integration.
**Setup:** tmp dir; pre-write a file with sentinel content at the computed path.
**Action:** `await ctrl.reader.loadEntryForDay(date)`.
**Assert:** sentinel content preserved; no log.

### S3 — `Reader.loadEntryForWeek` creates and opens, no log

**Type:** integration. Mirror of S1 for the week path.

### S4 — `Reader.loadEntryForWeek` opens existing file without overwrite

**Type:** integration. Mirror of S2.

### S5 — `LoadNotes.loadNote` creates and opens, no log

**Type:** integration. Mirror of S1 for the notes path.

### S6 — `LoadNotes.loadNote` opens existing note without overwrite

**Type:** integration. Mirror of S2 for the notes path.

### S7 — `fileExists` helper: missing path

**Type:** unit (with real `vscode.workspace.fs` — no genuine mocking needed; the helper is one tiny function and tests run in the Host anyway).
**Action:** `await fileExists(vscode.Uri.file('/tmp/does-not-exist-' + Date.now()))`.
**Assert:** returns `false`; no log.

### S8 — `fileExists` helper: existing path

**Type:** unit.
**Setup:** tmp file written via `writeFile`.
**Assert:** returns `true`.

### S9 — Manual: Remote SSH first-time entry create

**Type:** e2e (manual).
**Acceptance link:** spec acceptance #2.
**Setup:** Linux host via Remote-SSH; workspace where today's entry path is missing.
**Action:** `Ctrl+Shift+J → Today`.
**Assert:** entry opens immediately on first attempt; no notification toast; Journal OutputChannel has no `[ERROR]` line for the action.

### S10 — Manual: Remote SSH weekly entry create

**Type:** e2e (manual). Same shape as S9 with `Ctrl+Shift+J → Week`.

### S11 — Manual: Remote SSH new note create

**Type:** e2e (manual). Same shape as S9 with `note <title>` smart-input.

### S12 — Manual: WSL Remote first-time entry create

**Type:** e2e (manual). Same as S9 on WSL transport.

### S13 — Manual: WSL Remote weekly + notes

**Type:** e2e (manual). Same as S10 + S11 on WSL.

### S14 — Manual: Local entry create regression

**Type:** e2e (manual).
**Acceptance link:** spec acceptance #4 (local unchanged).
**Setup:** Local workspace; entry path missing.
**Action:** `Ctrl+Shift+J → Today`.
**Assert:** same observable behavior as before this PR (clean open).

## Dependencies

None. No cross-issue blockers, no cross-repo branches to land first.

Soft dependency: the branch already carries the merged #170 commits (PR #178 was opened from `170-…` and merged into this branch's ancestry). `npm install` may show no changes; if so, proceed.

## Risk

- **R1: `vscode.FileSystemError.code` value coupling.** The helper checks `err.code === 'FileNotFound'`. If a future VS Code version renames or returns the error differently, the helper will misroute to "re-throw" and the create path will never trigger. *Mitigation:* S7 covers the missing-file case; if the API changes, the test breaks immediately, before users do. Also, the VS Code API surface guarantees `FileSystemError.FileNotFound` is the canonical "not found" code per the docs.

- **R2: Race against parallel triggers.** If two `Today` invocations happen simultaneously (unlikely — single user, single shortcut), stat-then-create has a TOCTOU window. *Mitigation:* `Writer.createSaveLoadTextDocument` uses `vscode.workspace.fs.writeFile` which is idempotent overwrite — the second call would overwrite the first's empty header. The risk is purely theoretical for this UX; not worth a lock.

- **R3: Removing the `printError` log call hides legitimate errors.** In the old reader code, non-FileNotFound errors during `openDocument` went through `printError`. With stat-first, non-FileNotFound errors propagate as exceptions to the caller. *Mitigation:* the caller (`provider/commands/show-entry-for-today.ts` and similar) already logs and surfaces — verify during impl. If a caller swallows silently, fix that caller too (in scope as part of this PR if discovered).

- **R4: Test environment cannot simulate non-FileNotFound errors.** The "re-throws on other errors" branch may end up untested. *Mitigation:* document the contract in the helper code; add a TODO test if a clean simulation technique appears later. The risk is bounded because the helper is one-screen tiny.

- **R5: `J.Util.fileExists` barrel export creates a new entry point that diverges from the spec's wording.** Spec says "own module". The barrel re-export is a project convention, not a contradiction — the file is still its own module. *Mitigation:* mentioned in step 3; consistent with `J.Util.resolvePath` etc.

## Rollback

The change is contained: revert the merge commit (or the squashed PR commit) on `develop`. No data migration, no config schema change, no marketplace-side rollback needed. Pre-existing journal files are unaffected (the change only alters how new files are created).

If a partial issue surfaces post-merge (e.g. one of the three flows still logs on first create), the fix can be a follow-up PR rather than a full revert — the three methods are independent.

## Reference spec

`docs/specs/2026-05-14-fix-51-remote-file-creation.md` (committed at `d5c140d`, amended at `7d61846`).
