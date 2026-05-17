# Plan: Maintainability Quick Wins Before 1.1.0 (#188)

**Reference spec:** [docs/specs/2026-05-15-188-maintainability-quick-wins.md](../specs/2026-05-15-188-maintainability-quick-wins.md)

## Approach

Work in six sequential groups, smallest-blast-radius first. Run `npm test` after each group before proceeding. Migrate `new Promise()` wrappers to `async/await` in every file we touch (approved amendment), plus a dedicated sweep of remaining files at the end. Each group is a logical commit.

Branch: `fix/188-maintainability-quick-wins` from `develop`.

## Steps

### Step 1 — Atomic quick fixes (lowest risk, no cross-file deps)

Files: `src/util/logger.ts`, `src/ext/dialogues.ts`, `src/ext/conf.ts`, `src/actions/inject.ts`, `src/provider/commands/show-entry-for-date.ts`, `src/provider/commands/open-journal-workspace.ts`

1. `src/util/logger.ts:135` — replace `moment` call with `new Date().toISOString()`
2. `src/ext/dialogues.ts:560` — delete `console.log("adding file in scope", ...)` line
3. `src/ext/conf.ts:41` — `var defaultPatternDefinition` → `const`
4. `src/actions/inject.ts` — replace `this.ctrl.inject.injectString(...)` self-loop with `this.injectString(...)`
5. `src/actions/inject.ts:59-72` — collapse identical `task`/`todo` branches into `if (input.flags.match(/task|todo/))`
6. `src/provider/commands/show-entry-for-date.ts:85,95,101`, `open-journal-workspace.ts:87` — drop all `(this.ctrl.config as any)` casts (methods are already public on `Configuration`)
7. While in each file above, migrate any `new Promise()` wrappers to `async/await`

**Verify:** `npm test` green.

### Step 2 — Configuration additions (boundary fix: direct config reads)

Files: `src/ext/conf.ts`, `src/actions/navigation.ts`, `src/provider/commands/open-previous-entry.ts`, `src/provider/commands/open-next-entry.ts`

1. Add `getScopeDefinitions(): ScopeDefinitionLite[]` to `Configuration` — reads `this.config.get<ScopeDefinitionLite[]>('scopes') ?? []`
2. Add `getNavigationMode(): Mode` to `Configuration` — reads `this.config.get<Mode>('navigation.mode') ?? 'week'` (verify default from package.json)
3. `src/actions/navigation.ts:71` — replace direct `vscode.workspace.getConfiguration('journal').get('scopes')` with `ctrl.config.getScopeDefinitions()`
4. `open-previous-entry.ts:28`, `open-next-entry.ts:28` — replace direct config reads with `ctrl.config.getNavigationMode()`
5. While in `conf.ts`, migrate remaining `new Promise()` wrappers (11 in conf.ts) to `async/await`

**Verify:** `npm test` green.

### Step 3 — DRY extractions

Files: `src/util/paths.ts` (or new `src/util/uri.ts`), `src/provider/commands/show-entry-for-date.ts`, `src/provider/commands/open-journal-workspace.ts`, `src/ext/startup.ts`, `src/provider/commands/insert-memo.ts` (delete)

1. Extract `toLocalFileUri(path: string): vscode.Uri` to `src/util/paths.ts` — remove private copies in both command files; import from `paths.ts`
2. Extract remote-session guard: create `src/util/remote-guard.ts` (or inline helper in `src/util/`) that encapsulates the remote-detection logic currently duplicated at `show-entry-for-date.ts:53-79` and `open-journal-workspace.ts:81-83`; both command files delegate to it
3. Register `journal.memo` as alias in `Startup` using `ShowEntryForInputCommand.create(ctrl)`; delete `src/provider/commands/insert-memo.ts`
4. While in touched files, migrate remaining `new Promise()` wrappers to `async/await`

**Verify:** `npm test` green.

### Step 4 — Layer violation: Reader → SyncNoteLinks

Files: `src/actions/reader.ts`, `src/ext/startup.ts`

Current: `reader.ts:97` does `new J.Provider.SyncNoteLinks(this.ctrl).injectAttachementLinks(doc, date)` — actions layer instantiating a provider class.

Fix: Add an optional `onLoadEntry?: (doc: vscode.TextDocument, date: Date) => void` callback to `Reader` (or to the specific method). In `Startup`, after constructing `Reader`, wire `ctrl.reader.onLoadEntry = (doc, date) => new SyncNoteLinks(ctrl).injectAttachementLinks(doc, date)`. The `reader.ts` call site becomes `this.onLoadEntry?.(doc, date)`.

Alternative considered: pass `SyncNoteLinks` as a constructor dep — rejected because it duplicates the same coupling in `Startup`'s wiring and `SyncNoteLinks` is scheduled for future DI work anyway; a callback avoids locking in the shape.

5. While in `reader.ts` and `startup.ts`, migrate `new Promise()` wrappers to `async/await`

**Verify:** `npm test` green.

### Step 5 — Model boundary: move types out of `src/model/`

Files: `src/model/vscode.ts`, `src/provider/features/` (consuming files), all importers of the moved types

1. Determine exact consumers: `DecoratedQuickPickItem`, `TimedQuickPick`, `TextMateRule` — grep all imports
2. Move the three types to `src/provider/features/types.ts` (new file, or add to an existing feature types file if one exists)
3. Update all import sites
4. Delete `src/model/vscode.ts`

**Verify:** `tsc --noEmit` + `npm test` green (tsc catches import errors before the test suite).

### Step 6 — async/await sweep of remaining files

Files that still have `new Promise()` wrappers after steps 1–5: `src/actions/writer.ts`, `src/actions/parser.ts`, `src/ext/dialogues.ts` (remaining), `src/provider/features/match-input.ts`, `src/provider/features/sync-note-links.ts`, `src/util/paths.ts`

Migrate each `new Promise((resolve, reject) => { ... })` wrapper to `async/await`:
- If the body is a single awaitable call: `return new Promise((res, rej) => vscodeApi(args).then(res, rej))` → `return await vscodeApi(args)`
- If the body has multiple steps: extract into an `async` function body; replace `resolve(x)` with `return x`; replace `reject(e)` with `throw e`
- If the promise wraps a callback-style API (not a promise): keep the `new Promise()` wrapper — `async/await` cannot eliminate it, only hide it behind another layer

**Verify:** `npm test` green; check that no `new Promise()` wrappers remain except callback-API wrappers.

## Test scenarios

All scenarios run against `npm test` (existing suite). No new test files required.

| # | Scenario | Type | Acceptance criteria |
|---|----------|------|---------------------|
| T1 | Full suite after each step | Integration | `npm test` exits 0 after steps 1–6 |
| T2 | Logger timestamp format | Unit (logger tests if any) | Output contains ISO 8601 timestamp, not moment format |
| T3 | `journal.memo` command | Integration | `journal.memo` still opens entry-for-input (alias wired correctly) |
| T4 | Navigation mode from config | Integration | `open-previous-entry` / `open-next-entry` respect `journal.navigation.mode` |
| T5 | Scope-aware navigation | Integration | Navigation with scopes defined works as before |
| T6 | Remote session guard | Integration | `show-entry-for-date` and `open-journal-workspace` still prompt correctly on remote sessions |
| T7 | No phantom test failures | Suite hygiene | `rm -rf out/` + `npm run compile-tests` + `npm test` — count matches clean branch |

## Dependencies

None. All changes are in this repo; no other PRs must land first.

## Risk

| Risk | Mitigation |
|------|------------|
| `async/await` migration changes error-propagation behaviour (rejected promise vs thrown error in `.catch()` chain) | Each migration is a local refactor; callers already `await` the return value. Test suite catches broken error paths. |
| Moving types from `model/vscode.ts` breaks imports not caught by grep | `tsc --noEmit` in step 5 will catch any missed import sites before the suite runs. |
| Deleting `insert-memo.ts` without correct alias in `Startup` silences `journal.memo` | `npm test` includes command-registration smoke tests; will fail if command unregistered. |
| Reader callback not wired in `Startup` causes silent no-op (links not injected) | Existing `notes-sync.test.ts` covers `injectAttachementLinks`; failure surfaces there. |

## Rollback

All changes are in one feature branch. `git revert` or branch deletion restores prior state with no DB or config side effects.
