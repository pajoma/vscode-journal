# Plan: Integration tests for all user stories — 1.1.0 (#190)

**Reference spec:** [docs/specs/2026-05-15-190-tests-user-journey-coverage.md](../specs/2026-05-15-190-tests-user-journey-coverage.md)

## Approach

All tests run inside the VS Code Extension Host against a real tmp workspace. Happy-path tests use a real `Ctrl` built from a workspace-scoped config (pattern from `commands-prev-next.test.ts`). Error-path tests either induce a real failure (e.g., missing base dir) or monkey-patch a single seam (e.g., `ctrl.ui.getUserInput` → `''`) when real failure is impractical inside the Extension Host. No mocking of `vscode.workspace.fs`.

Implementation order: infra fixes first (clean baseline), then new suites, then extensions to existing suites.

---

## Step 0 — Infra fixes (must land before new suites)

**Why first:** Three existing suites have latent flakiness that will pollute CI for new tests running in the same session.

### 0a. `read-templates.test.ts` — add `afterEach` teardown
- Mutation: `before` sets `journal.scopes` but no `afterEach` restores it.
- Fix: add `afterEach` that calls `config.update('scopes', originalScopes, ConfigurationTarget.Workspace)`. Save original in `before`.
- Test scenario: **infra** — no new assertion, just prevents cross-suite contamination.

### 0b. `phase1-regression.test.ts:74` — fix midnight-brittle assertion
- Line 74: `assert.strictEqual(input.offset, 0, ...)` — passes in normal hours, fails if the test crosses midnight between `new Date()` calls.
- Fix: compute today's ISO string once, parse it, assert `input.offset === 0`. One `Date` capture, one assertion.

### 0c. `week-input.test.ts:62,70` — fix year-rollover week calc
- Lines 62 and 70 use `moment().week()` — week 52 → 1 rollover breaks the assertion.
- Fix: parse the week number out of `input` directly (it is already set by the parser), assert `nextWeekInput.week === thisWeekInput.week + 1`. No `moment()` call in test code.

### 0d. `notes-sync.test.ts` — log captured state on timeout
- Current: 8×500ms poll, no output on failure.
- Fix: after the poll loop, if assertion fails, include `JSON.stringify({ editorUri: editorAgain?.document.uri.toString(), timedOut: true })` in the `assert` message.

---

## Step 1 — `codeaction-tasks.test.ts` (new file)

**Why:** `OpenTaskActions` and `CompletedTaskActions` have zero direct tests. Code actions modify documents via `WorkspaceEdit` — must verify the edit round-trips through the document.

### Test scenarios

| # | Path | Scenario | Assertion |
|---|------|----------|-----------|
| 1 | happy | `OpenTaskActions.provideCodeActions` on `- [ ] foo` line returns actions and applying first edit replaces `[ ]` with `[x]` and appends ` (done: ...)` | `edit.has(doc.uri)`, text contains `[x]`, text contains `done:` |
| 2 | error | `OpenTaskActions.provideCodeActions` on a plain text line returns `undefined` or empty array | result is falsy or `.length === 0` |
| 3 | happy | `CompletedTaskActions.provideCodeActions` on `- [x] foo (done: 2026-05-15 10:00)` returns action; applying removes `[x]` → `[ ]` and strips annotation | text matches `- [ ] foo`, no `done:` |
| 4 | error | `CompletedTaskActions.provideCodeActions` on an open-task line returns `undefined` or empty | result is falsy or `.length === 0` |

**Implementation notes:**
- Use `openEditor(content)` from `command-test-helpers.ts` to get a `TextDocument`.
- Build a `Range` on line 0: `new vscode.Range(0, 0, 0, line.length)`.
- Build a stub `CodeActionContext`: `{ diagnostics: [], only: undefined, triggerKind: vscode.CodeActionTriggerKind.Invoke }`.
- After `provideCodeActions`, call `vscode.workspace.applyEdit(actions[0].edit!)` and re-read `document.getText()`.
- `ctrl` must supply `getTaskInlineTemplate()` — use `createMockCtrl()` from helpers.
- CancellationToken: `new vscode.CancellationTokenSource().token`.

---

## Step 2 — `commands-inject.test.ts` (new file)

**Why:** `Inject.injectInput` wires the memo/task insertion path — no targeted test exists for the write-to-file round-trip.

### Test scenarios

| # | Path | Scenario | Assertion |
|---|------|----------|-----------|
| 1 | happy | Seed today's entry with header, call `ctrl.inject.injectInput(doc, memoInput)`, assert file on disk contains the memo line | `onDisk.includes(memoText)` |
| 2 | happy | Same for `task:` input — assert file contains task bullet `- [ ]` | `onDisk.includes('- [ ]')` |
| 3 | happy | File-link input — assert inserted link pattern present | `onDisk.includes('[[')` or similar |
| 4 | error | `injectInput` called with empty memo text — assert no error logged, doc unchanged | `logger.errors.length === 0`, content unchanged |

**Implementation notes:**
- Use `buildCtrl(tmpBase)` helper pattern (from `commands-prev-next.test.ts`).
- Seed entry: `await ctrl.reader.loadEntryForDay(new Date())` → this creates the entry file with the default template.
- Build `MemoInput`: `const input = new J.Model.Input(); input.text = 'lorem ipsum'; input.setFlag(J.Model.InputFlags.Memo);` — check the actual flag API in `src/model/`.
- After inject: read file via `vscode.workspace.fs.readFile` and `new TextDecoder().decode(...)`.
- Teardown: delete tmpBase, restore `journal.base`.

---

## Step 3 — `commands-note.test.ts` (new file)

**Why:** `ShowNoteCommand` calls `LoadNotes.load()` which creates a file — no test verifies the file is actually written.

### Test scenarios

| # | Path | Scenario | Assertion |
|---|------|----------|-----------|
| 1 | happy | Monkey-patch `ctrl.ui.getUserInput` → `'my test note'`, call `cmd.execute()`, assert note file exists on disk | `fileExists(expectedUri) === true` |
| 2 | error | Monkey-patch `ctrl.ui.getUserInput` → throws (user cancels), call `cmd.execute()`, assert `showError` called and no file created | `showError` spy called, no file |

**Implementation notes:**
- `ShowNoteCommand` uses `protected constructor` — instantiate as `new (ShowNoteCommand as any)(ctrl)`.
- Spy `showError`: `let errorCalled = false; (ctrl.ui as any).showError = () => { errorCalled = true; };`
- Spy `showDocument`: capture called URI.
- The note file path is resolved via `Configuration.getNotesPathPattern`. After `execute()`, verify via `vscode.workspace.fs.stat(expectedUri)` — no error = file exists.
- Expected path: `${base}/notes/${title}.${ext}` (default pattern). Read actual from captured `showDocument` argument URI.

---

## Step 4 — `commands-weekly.test.ts` (new file)

**Why:** `Writer.createWeeklyForPath` has no test that verifies the file is actually written with the resolved weekly template.

### Test scenarios

| # | Path | Scenario | Assertion |
|---|------|----------|-----------|
| 1 | happy | `ctrl.reader.loadEntryForWeek(weekNum)` against tmp base → file exists at `${base}/${year}/w${pad(weekNum)}.md` with content matching `weekly` template | `fileExists(expectedUri)`, `content.includes(weekNum.toString())` |
| 2 | error | `ctrl.reader.loadEntryForWeek(0)` — week 0 is invalid → error logged or exception thrown | `logger.errors.length > 0` OR `await assert.rejects(...)` |

**Implementation notes:**
- Week number: use a fixed value (e.g., `20`) to avoid year-rollover issues.
- Expected path: derive from `Configuration.getWeeklyPathPattern(20)` or hardcode `path.join(tmpBase, year, 'w20.md')`.
- Content check: `weekly` template default includes `${week}` — verify week number appears in file content.

---

## Step 5 — Extend `commands-entry.test.ts` — real-FS entry command tests

**Why:** Existing entry tests use mocks. Need real FS proof that today/yesterday/tomorrow commands create files.

### Test scenarios (add to existing suite)

| # | Path | Scenario | Assertion |
|---|------|----------|-----------|
| 1 | happy | Build real `Ctrl` with tmp base, `cmd.execute(input{offset:0})`, assert file exists at expected day path | `fileExists(expectedUri) === true`, `logger.errors.length === 0` |
| 2 | happy | offset -1 (yesterday) and +1 (tomorrow) — file created at correct paths | files exist at expected paths |
| 3 | error | Mock `ctrl.reader.loadEntryForInput` to throw, call `cmd.execute()`, assert `ctrl.ui.showError` is called | `errorCalled === true` |

**Implementation notes:**
- Use same `buildCtrl(tmpBase)` helper.
- Expected path for offset 0: `path.join(tmpBase, year, month, day + '.md')`.
- Monkey-patch `ctrl.ui.showDocument` to capture document (so we don't open real VS Code tabs).
- For error path: override `(ctrl.reader as any).loadEntryForInput = async () => { throw new Error('test error'); }`.

---

## Step 6 — Extend `commands-prev-next.test.ts` — non-default scope

**Why:** Existing tests use only default scope. #144 bug was specifically about scope isolation.

### Test scenarios (add to existing command-layer suite)

| # | Path | Scenario | Assertion |
|---|------|----------|-----------|
| 1 | happy | Seed `${base}/scopes/work/2025/03/05.md` and `08.md`; configure `journal.scopes` with `work` scope; anchor on `08.md`; run `OpenPreviousEntryCommand`; assert `05.md` opened and not any default-scope file | active editor path ends in `05.md` |
| 2 | error | Scope `work` has only one entry; run `OpenPreviousEntryCommand`; assert info toast shown and editor stays on that entry | toast message matches `/No earlier/i` |

**Implementation notes:**
- Scope seed path: `${tmpBase}/scopes/work/2025/03/05.md` — directory structure is scoped to `${base}/scopes/${scopeName}/`.
- Set `journal.scopes` config: `[{ name: 'work', patterns: { entries: { path: '${base}/scopes/work/${year}/${month}', file: '${day}.${ext}' } }, templates: [] }]`.
- Open the scoped anchor file: `vscode.window.showTextDocument(vscode.Uri.file(anchorPath))`.
- Teardown: restore `journal.scopes` and `journal.base`; delete tmpBase.

---

## Step 7 — Extend `commands-print.test.ts` — error paths

**Why:** Three happy-path tests exist. Error paths (no editor, no selection, invalid text) are untested.

### Test scenarios (add to existing suite)

| # | Path | Scenario | Assertion |
|---|------|----------|-----------|
| 1 | error | `PrintTimeCommand.printTime()` with no active editor (mock `showActiveEditor` → undefined) — assert no crash, `showError` called or injection skipped | no unhandled rejection |
| 2 | error | `PrintSumCommand.execute()` with selections containing no numeric text — assert result is `'0'` or `showError` called | injected text is `'0'` OR `showError` called |
| 3 | error | `PrintDurationCommand.printDuration()` with only one cursor (can't compute duration) — assert result is `'0.00'` or `showError` called | injected text `'0.00'` OR `showError` called |

**Implementation notes:**
- `PrintTimeCommand`: active editor is read from `vscode.window.activeTextEditor`. Monkey-patch: `Object.defineProperty(vscode.window, 'activeTextEditor', { get: () => undefined, configurable: true })`. Restore in teardown.
- For sum/duration with zero-value inputs: use `createMockCtrl` with `injectString` spy.

---

## Test scenarios — complete list (acceptance checklist)

**Code actions:**
- [x] `OpenTaskActions` happy: open-task line → `[x]` + timestamp
- [x] `OpenTaskActions` error: non-task line → empty result
- [x] `CompletedTaskActions` happy: completed-task line → `[ ]` + annotation removed
- [x] `CompletedTaskActions` error: open-task line → empty result

**Inject:**
- [x] Memo inject happy: memo line in file
- [x] Task inject happy: `- [ ]` in file
- [x] File-link inject happy: link pattern in file
- [x] Empty-text inject error: no error logged

**Note:**
- [x] Note creation happy: file exists
- [x] Note cancel error: `showError` called

**Weekly:**
- [x] Weekly creation happy: file at correct path, week number in content
- [x] Week 0 error: error logged or rejects

**Entry commands (real FS):**
- [x] Today happy: file created at today's path
- [x] Yesterday/tomorrow happy: files at correct offsets
- [x] Reader throws error: `showError` called

**Prev/next navigation:**
- [x] Scoped prev happy: opens prior entry in same scope
- [x] Scoped prev at start error: toast shown

**Print commands:**
- [x] PrintTime no editor error: no crash
- [x] PrintSum no numeric selection error: `'0'` or `showError`
- [x] PrintDuration one cursor error: `'0.00'` or `showError`

---

## Dependencies

- Infra fixes (Step 0) must land before any new suite is merged — they are in the same branch.
- No external PRs blocking.

## Risk

- Code action `WorkspaceEdit` application in tests requires the document to be open in an editor. `openEditor()` from helpers handles this.
- Scoped entry path resolution depends on `Configuration` correctly parsing the `scopes` config. If the default scope pattern is not overridable at workspace level, the scoped nav tests will need to use a different seed strategy. Validate this during implementation.
- `CompletedTaskActions` annotation range uses `substr` (deprecated) — test should still pass; do not refactor in this PR.

## Rollback

Delete the new test files and revert extensions to existing suites. No production code changes are made in this issue.
