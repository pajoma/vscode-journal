# Issue #144 — Open Previous / Open Next entry navigation

> **Issue:** [pajoma/vscode-journal#144](https://github.com/pajoma/vscode-journal/issues/144)
> **Branch:** `144-journal-open-previous-and-open-next-feature`
> **Created:** 2026-05-14

## Goal

Add two commands — `journal.openPrevious` and `journal.openNext` — that step backwards / forwards through journal **daily entries** relative to the currently open file. Step semantics are user-configurable: either "next/previous **existing** entry on disk" (default) or "next/previous **calendar day** (create if missing)". Navigation honors the active journal scope. Default keybindings: `Ctrl+J ,` (previous) and `Ctrl+J .` (next).

## Why now

Filed in 2018 by a user with parallel work/personal journals. Pain point: traversing meeting notes day-by-day requires opening the smart-input prompt and typing offsets each time. The pain compounds with multi-day gaps (weekends, holidays) where `-1` doesn't land on an existing entry. Now is a reasonable time because:

- The `ScanEntries` feature (added later for the picklist) already enumerates all entries on disk — `openPrevious` mode `existing` can reuse that walk.
- `getDateFromURIAndConfig` (`src/util/paths.ts:113`) already extracts a `Date` from a journal entry's path — needed to identify the "current" anchor.
- `1.1.0` milestone owns this issue and pruning the milestone is a release goal.

## Scope

### In scope

1. **Two new commands** registered under `journal.openPrevious` and `journal.openNext` with command palette titles and l10n entries across the eleven existing locales (en, de, fr, es, it, pt, nl, ru, zh, ja, ar).

2. **Two navigation modes**, selected by a new setting `journal.navigation.mode`:
   - `"existing"` *(default)* — find the previous/next entry whose file already exists on disk. Skip gaps. If no prior entry exists, show an info toast ("No earlier journal entry found") and do nothing.
   - `"calendar"` — step exactly `-1` / `+1` calendar day from the anchor. Create the target entry if missing (same code path as `Open Yesterday` / `Open Tomorrow` already exercise). No skipping.

3. **Anchor resolution**:
   - If `vscode.window.activeTextEditor.document.uri` is a journal **daily entry** (date parseable via `getDateFromURIAndConfig`), that entry's date is the anchor.
   - Otherwise (no editor open, or the active document is not a journal entry — e.g. a note, weekly entry, attachment, or some unrelated file), the anchor is **today**.
   - When the anchor is today and mode is `existing`, "previous" means the most recent past entry; "next" means today (if exists) or the nearest future entry (if any was pre-created).

4. **Scope honoring**:
   - The active scope is derived from the anchor entry's path (which scope's `${base}` matches the parent directory). If the anchor is "today" (no file open), the active scope is the **default** scope.
   - Navigation in `existing` mode walks only the entries under the active scope's resolved entry directory. Cross-scope navigation is not in scope.

5. **Default keybindings**: `Ctrl+J ,` → `journal.openPrevious`, `Ctrl+J .` → `journal.openNext`. Both bound to the `editorTextFocus` `when` clause (consistent with `journal.printDuration` / `journal.printSum`). User can override via `Keyboard Shortcuts`.

6. **Settings UI**: register `journal.navigation.mode` in `package.json` `contributes.configuration` with enum values `"existing"` and `"calendar"` and a default of `"existing"`. Translated description strings.

7. **Tests**:
   - Unit-level coverage for the date-stepping helper(s) used to resolve "previous existing" and "next existing" against a mocked directory listing.
   - Integration test in the Extension Host: pre-seed a tmp workspace with three entries (e.g. `2025-03-05`, `2025-03-08`, `2025-03-12`), open the middle one, run `openPrevious`, assert the `2025-03-05` entry is opened. Same shape for `openNext`. Same shape for `calendar` mode with create-if-missing.
   - Regression test: when no anchor file is open, `openPrevious` walks back from today.
   - Regression test: when active scope is non-default, navigation stays within that scope's directory.

### Out of scope

- **Weekly entries.** `${base}/<year>/<week>.md` (or wherever weeklies live) is not part of the chronological traversal in this PR. They can be added later if requested. (Issue text mentions "notes" only.)
- **Notes** (the per-day subdirectory note files). Navigating across note files within a day or across days is a separate, more complex problem (mixing chronology with title-based ordering). Out of scope per the clarifying-question answers — user chose "honor active scope" without selecting notes.
- **Cross-scope navigation.** If the user has both `work` and `private` scopes, navigation does not jump from `work` entries to `private` entries.
- **Wrap-around.** Reaching the oldest/newest entry shows an info toast and stops. No wrap-around to opposite end.
- **Recent-files MRU traversal.** Navigation is by entry **date**, not by file-modification time.
- **CodeLens / status-bar navigation buttons.** Command palette + keybindings only.
- **Caching.** `ScanEntries` already maintains a cache for the picklist; reuse it if convenient, but a dedicated cache for prev/next is not in scope. A fresh `vscode.workspace.fs.readDirectory` walk per invocation is acceptable for typical journal sizes.

## Acceptance criteria

1. `npm run check` clean. New tests pass on first run.
2. **Manual — `existing` mode (default):**
   - Workspace pre-seeded with daily entries on `2025-03-05`, `2025-03-08`, `2025-03-12`. No entry for any other date.
   - Open `2025-03-08`. `Ctrl+J ,` opens `2025-03-05`. `Ctrl+J .` opens `2025-03-12`.
   - From `2025-03-12`, `Ctrl+J .` shows the info toast "No later journal entry found." and the editor does not change.
   - From `2025-03-05`, `Ctrl+J ,` shows "No earlier journal entry found." and the editor does not change.
   - No `[ERROR]` lines in the Journal output channel.
3. **Manual — `calendar` mode:**
   - With `journal.navigation.mode` set to `calendar`, open `2025-03-08`. `Ctrl+J ,` opens `2025-03-07` (created if missing). `Ctrl+J .` opens `2025-03-09` (created if missing).
4. **Manual — no anchor:**
   - Close all editors. `Ctrl+J ,` (in `existing` mode) opens the most recent past entry (e.g. `2025-03-12` from the seed above if today is later). `Ctrl+J .` opens the nearest future entry or shows the toast if none.
5. **Manual — multi-scope:**
   - Two scopes configured: `default` and `work`. Seed `default` with entries `2025-03-05/08/12` and `work` with entries `2025-04-01/02`. Open the `work` entry `2025-04-02`. `Ctrl+J ,` opens `2025-04-01`, NOT a default-scope entry.
6. **L10n:** Command palette titles and the "No earlier/later entry found" toast render in German, French, Spanish, etc. — at least one non-English locale spot-checked.

## Entities / contracts touched

- `src/provider/commands/` — two new command files:
  - `open-previous-entry.ts` (`journal.openPrevious`)
  - `open-next-entry.ts` (`journal.openNext`)
  Each follows the existing static-`create(ctrl)` pattern (see `show-entry-for-today.ts`).
- `src/provider/commands/index.ts` — register the new commands.
- `src/ext/startup.ts` — wire the new commands into the activation sequence.
- `src/actions/navigation.ts` — **new file** containing the pure navigation logic:
  - `resolveAnchor(ctrl, activeEditor): Promise<{ date: Date; scope: string }>`
  - `findAdjacentEntry(ctrl, anchor: { date; scope }, direction: 'previous' | 'next', mode: 'existing' | 'calendar'): Promise<Date | null>`
  Separating logic from command surface lets tests target the helpers directly without command-palette plumbing.
- `package.json`:
  - `contributes.commands` — two new entries.
  - `contributes.keybindings` — two new entries (`ctrl+j ,` and `ctrl+j .`, `when: editorTextFocus`).
  - `contributes.configuration.properties` — new `journal.navigation.mode` enum.
- `package.nls.json` and `package.nls.<locale>.json` for all eleven locales — new strings:
  - `command.journal.openPrevious.title`
  - `command.journal.openNext.title`
  - `configuration.journal.navigation.mode.description`
- `l10n/bundle.l10n.json` and `l10n/bundle.l10n.<locale>.json` — runtime strings for the toasts ("No earlier journal entry found", "No later journal entry found").
- `src/test/suite/` — new test file `commands-prev-next.test.ts` (matches the `commands-*` naming pattern).

## Constraints

- **No raw `fs`.** All FS access via `vscode.workspace.fs` (PLAN.md Phase 1.3 invariant).
- **`vscode.l10n`.** New user-facing strings go through `vscode.l10n.t(...)` for runtime, NLS keys for manifest.
- **Anchor detection must be robust** to paths that look journal-shaped but are not (e.g. a markdown file in the journal base that wasn't created by this extension). The anchor resolution falls back to "today" on any parse failure rather than throwing.
- **Performance.** For workspaces with thousands of entries, the `existing` walk should not block the UI noticeably. Strategy: walk the entry directory (already structured by year/month per `journal.patterns.notes.path` defaults), short-circuit as soon as the adjacent file is found rather than enumerating the entire tree.
- **No promise wrappers in new code.** Write native `async/await` from the start (PLAN.md Phase 2.2 direction).
- **Named imports preferred.** New files use `import { Foo } from '...'` rather than `import * as J from '...'` for new code (PLAN.md Phase 2.3 direction). Existing wiring code can stay namespace-style.

## Open questions

1. **Year-boundary traversal in `existing` mode.** If the entry directory is `${base}/2024/12/31.md` and the next entry is `${base}/2025/01/05.md`, the walk must cross the year subdirectory. The plan must spell out the directory enumeration order to ensure this works.
2. **What counts as a "daily entry" in the walk?** The entry filename pattern defaults to `${day}.${ext}` (e.g. `14.md`). Notes live in `${base}/<year>/<month>/<day>/<title>.md`. Anchor detection must distinguish — likely by matching the exact path template, not just "any markdown file under base".
3. **Stale `ScanEntries` cache.** If the cache is used and a new entry has been created since the cache was populated, the cache may miss it. Plan: either bypass the cache for navigation, or invalidate after `createEntryForPath`. Decision deferred to the plan.

## Related issues

- Indirectly related: `ScanEntries` and the picklist feature share directory-walking logic — reuse vs. duplicate is a plan-level decision.
- No cross-repo dependencies. No `blocked-by:` / `blocks:` labels.

## Reference

- Issue body (one paragraph): user navigates meeting notes day-by-day, wants prev/next shortcuts that complement `Open Yesterday` / `Open Tomorrow`.
- Existing similar surfaces for inspiration:
  - `src/provider/commands/show-entry-for-date.ts:97` — already does anchor-aware entry resolution for the smart-input.
  - `src/provider/features/scan-entries.ts:13` — directory-walking + caching.
  - `src/util/paths.ts:113` — `getDateFromURIAndConfig` for anchor parsing.
