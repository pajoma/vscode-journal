# Issue #51 — Error opening/creating journal files over remote connection

> **Issue:** [pajoma/vscode-journal#51](https://github.com/pajoma/vscode-journal/issues/51)
> **Branch:** `51-error-openingcreating-journal-files-over-remote-connection`
> **Created:** 2026-05-14

## Goal

When the user triggers a journal action (`journal.today`, `journal.day`, weekly entry, or note creation) in a Remote SSH or WSL workspace and the target file does not yet exist, the extension must create the file and open it without surfacing any error to the user. No `[ERROR]` line in the output channel, no VS Code error notification toast, no requirement to retry the command.

## Why now

Open since 2019 (issue #51) with thumbs-up from multiple users on the `1.1.0` milestone. The user experience is "press shortcut → see scary error → press shortcut again → it works." Even when no work is lost, the error breaks trust and is the first thing remote users hit on day one. Phase 1.3 of `PLAN.md` migrated raw `fs` calls to `vscode.workspace.fs` and the manifest now declares `extensionKind: ["workspace"]`, so the infrastructure is in place to make remote work cleanly — but the open-before-create code path was not touched and still produces the symptom.

## Reproduction status

**Unknown on the current `develop` HEAD.** The fix MUST start with a verified reproduction (or a definitive "the symptom is gone for case X but still present for case Y") in the implementation plan. This spec lists the code paths that still carry the broken pattern — if any of them are exercised, the bug is still live.

## Root cause (analysis)

All three "open or create" code paths use the same shape: call `vscode.workspace.openTextDocument(uri)` first, catch the failure, then `createSaveLoadTextDocument`. On a remote workspace, `openTextDocument` on a missing file surfaces a VS Code internal error and rejects with a message string that starts with `cannot open vscode-remote:` (or `cannot open file:` locally).

The three call sites:

1. **`src/actions/reader.ts:97` — `Reader.loadEntryForDay`.** Catch at line 118–124 filters on both prefixes (`cannot open file:` AND `cannot open vscode-remote:`), so the *logger* stays quiet on the happy path, but the VS Code error toast from the failed `openTextDocument` is independent of our catch and still reaches the user.
2. **`src/actions/reader.ts:54` — `Reader.loadEntryForWeek`.** Catch at line 68–74 only filters `cannot open file:`. On a remote workspace, the week entry path logs `[ERROR]` AND surfaces the toast.
3. **`src/provider/features/load-note.ts:42` — `LoadNotes.loadNote`.** Catch at line 50 does not filter anything; it falls through to `createSaveLoadTextDocument` but still logs `error` and the toast appears.

Common downstream: `Writer.createSaveLoadTextDocument` (`src/actions/writer.ts:117`) is the actual create+open. It uses `vscode.workspace.fs.writeFile(...)` then `vscode.workspace.openTextDocument(...)`, both of which are remote-aware. The create itself is not broken — only the speculative *open before create* is.

The fix must replace "open and catch failure" with "check existence first, then open OR create." `vscode.workspace.fs.stat(uri)` is the silent existence check (rejects with a typed `FileSystemError` that does not bubble a notification).

## Scope

### In scope

1. **Replace open-before-create with stat-first** in all three call sites:
   - `Reader.loadEntryForDay` (entry path)
   - `Reader.loadEntryForWeek` (weekly path)
   - `LoadNotes.loadNote` (notes path)

   Pattern: `await vscode.workspace.fs.stat(uri)` → if rejects with `FileNotFound`, call writer; otherwise call `openDocument`. No reliance on error-message prefix matching.

2. **Remove the prefix-matching catch logic** at `reader.ts:118–124` and `reader.ts:68–74` once stat-first is in place. The fragile string check disappears with the pattern.

3. **Confirm `Writer.createSaveLoadTextDocument` is remote-safe** — `vscode.Uri.file(path)` from a workspace-host extension resolves to the workspace filesystem, which on remote IS the remote FS. No change expected here, but verify with a regression test.

4. **Regression coverage.** New unit/integration tests in `src/test/suite/` that:
   - Drive `Reader.loadEntryForDay` against a non-existent path → asserts file is created, opened, and **no error is logged** via `Logger`.
   - Drive `Reader.loadEntryForWeek` against a non-existent path → same assertion.
   - Drive `LoadNotes.loadNote` against a non-existent path → same assertion.
   - Pre-existing file → opens it, does NOT overwrite.

   Tests run against the local workspace FS (the extension host's `vscode.workspace.fs` already abstracts local vs remote — the same code path that fails on remote also fails on local if the assertion is "no error logged"). Manual remote verification is still required for the acceptance check.

### Out of scope

- Refactoring `Reader` to drop the `new Promise((resolve, reject) => …)` wrappers around already-async code (`PLAN.md` Phase 2 owns the native `async/await` cleanup). The stat-first change will land *inside* the existing promise wrappers and a follow-up task can flatten them.
- Replacing `vscode.Uri.file(...)` with `vscode.workspace.workspaceFolders[0].uri.with(...)` or similar workspace-relative URI construction. The current `Uri.file` form already works on remote because the extension runs as a workspace extension; verify, do not change.
- Codespaces / dev containers (user scoped out — `Remote SSH` + `WSL Remote` only). Codespaces uses the same `vscode-remote:` family so the fix should incidentally cover it, but it is not part of the acceptance criteria.
- The `LoadNotes.load → loadEntryForInput` recursive call (`load-note.ts:28`). It calls back into `Reader.loadEntryForDay`, which is already covered by item 1 — but the recursion means the fix for #1 must land before notes work fully on remote.

## Acceptance criteria

1. `npm run check` passes — lint clean, esbuild compiles, all existing tests pass, every new regression test from "In scope #4" passes on first run.
2. Manual repro on **Remote SSH** (a Linux host over SSH, VS Code remote-ssh extension):
   - Open a fresh workspace where the journal path resolves to a directory with no entry for today.
   - Trigger `Ctrl+Shift+J` → `Today`.
   - The new entry opens immediately on the first attempt. No error notification toast. The OutputChannel (`Journal` log) contains no `[ERROR]` line for the action.
   - Repeat with `Ctrl+Shift+J` → `Week` (weekly entry creation).
   - Repeat with `note new note title` (notes creation).
3. Manual repro on **WSL Remote**: same three actions, same assertions.
4. Existing local behavior is unchanged — opening today's entry on the local FS still works whether the file exists or not.
5. No reintroduction of raw `fs` / `fs.promises` (PLAN.md Phase 1.3 invariant).

## Entities / contracts touched

- `src/actions/reader.ts`
  - `loadEntryForDay(date: Date): Promise<vscode.TextDocument>` — rewrite the `Promise.all → .then → .catch` chain to a stat-first flow.
  - `loadEntryForWeek(week: Number): Promise<vscode.TextDocument>` — same rewrite.
- `src/provider/features/load-note.ts`
  - `loadNote(path: string, content: string): Promise<vscode.TextDocument>` — replace open-and-catch with stat-first.
- `src/util/paths.ts` (optional)
  - There may be value in extracting a `existsViaFs(uri: vscode.Uri): Promise<boolean>` helper that wraps `vscode.workspace.fs.stat` with the `FileNotFound` swallow. `paths.ts:172` already uses `fs.stat` for a similar check; consolidate if it cleans up the call sites.
- `src/actions/writer.ts`
  - Likely unchanged. Inspect during implementation to confirm `createSaveLoadTextDocument` does not need a similar stat-first guard against accidental overwrite (current behavior: it WILL overwrite if the file exists, which is the intended semantics for the "create" path — callers are responsible for not calling it on an existing file). The stat-first refactor in callers preserves this invariant.
- `src/test/suite/` — new test file (e.g. `reader-remote-create.test.ts`) or extensions to `phase1-regression.test.ts`.

## Constraints

- Must use `vscode.workspace.fs` for all FS operations (no `fs` / `fs.promises`).
- Cannot rely on the error message text of `openTextDocument` — that is the current fragility.
- Must not change the `Promise<vscode.TextDocument>` signatures of the three rewritten methods (callers in commands expect them).
- Must preserve the side effect at `reader.ts:129` (`SyncNoteLinks.injectAttachementLinks`) — the link injection happens after open OR create, on every successful load.

## Open questions

1. Should `existsViaFs` live in `src/util/paths.ts` (already exports `resolvePath` and uses `fs.stat`) or in a new module? Decision punted to the plan step — the implementation will pick whichever keeps the diff smaller.
2. The current catch in `loadEntryForDay` (line 118) discriminates between "open failed because file missing" (fall through to create) and "open failed for some other reason" (reject, log). With stat-first, a `stat` rejection that is NOT `FileNotFound` (e.g. permission denied) must still reject loudly. The implementation must preserve that branch.

## Related issues

- `PLAN.md` Phase 1.3 — `fs` → `vscode.workspace.fs` migration. This issue is the user-visible payoff of that phase.
- No cross-repo dependencies. No `blocked-by:` / `blocks:` labels needed.

## Reference

- Issue body: `Ctrl+Shift+J → Today` on remote SSH produces `Error: cannot open vscode-remote://…/2019/10/24.md` followed by a successful next attempt.
- Owner repro (in issue): same error in WSL.
- Three additional `+1` comments from other users on the same milestone.
- Current code: `src/actions/reader.ts:97`, `src/actions/reader.ts:54`, `src/provider/features/load-note.ts:42`, `src/actions/writer.ts:117`.
