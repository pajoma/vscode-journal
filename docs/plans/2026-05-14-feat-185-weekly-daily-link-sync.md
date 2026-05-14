# Plan — Feature #185: Weekly Page Auto-Sync of Daily Entry Links

**Issue:** [pajoma/vscode-journal#185](https://github.com/pajoma/vscode-journal/issues/185)
**Spec:** [docs/specs/2026-05-14-feat-185-weekly-daily-link-sync.md](../specs/2026-05-14-feat-185-weekly-daily-link-sync.md)
**Branch:** `168-possible-to-use-weekly-instead-of-daily-for-memos-ect` (bundled with #168)
**Date:** 2026-05-14
**Status:** Draft — awaiting approval on issue.

## Approach

A new feature class `SyncDailyLinks` is the workhorse: given a weekly `TextDocument`, week, year, and scope, it enumerates daily files for the week from the configured `entries` path pattern (via `Reader` / `Configuration`), renders link lines from the configured template, and replaces the anchored block in the weekly doc with the rendered set. The class is pure-by-default: it takes a doc and a URI list, returns a string, and only the final `applyBlock` step performs an `applyEdit`.

A separate `WeeklyEntryWatcher` owns lifecycle: it listens to `onDidChangeActiveTextEditor`, recognizes weekly files via a new `getWeekFromURIAndConfig` helper, and registers a narrow `FileSystemWatcher` over the day URIs of that ISO week. On FS events, it debounces (500 ms) and re-invokes `SyncDailyLinks.sync`. On editor change away from a weekly file, it disposes the watcher.

Insertion into the existing pipeline happens in two places, mirroring how `#168` integrated:
- `Reader.loadEntryForWeek` returns the doc as today; we wrap the call site in `AbstractLoadEntryForDateCommand.loadPageForInput` to invoke `SyncDailyLinks.sync` after the existing `Inject.injectInput` step, so opening a weekly file from any command runs the initial sync.
- `Startup.registerCommands` instantiates and registers `WeeklyEntryWatcher` once per extension activation; its disposable is pushed onto `context.subscriptions`.

**Trade-offs:**
- *Sync on open vs. sync on watcher events only.* Synced on both — open guarantees the file is in the right state when first viewed; the watcher handles edits during the session. Skipping the open-time sync would leave stale state in the file.
- *FS watcher vs. polling.* FS watcher only. Polling is wasteful and can miss rapid create+delete. The downside (some platforms with flaky watchers) is accepted; the issue body explicitly asks for auto-sync, which implies event-driven.
- *Replace block vs. line-by-line diff.* Whole-block replace. Simpler, deterministic, no edge cases around partial conflicts. The user-visible cost (their cursor moves if it was inside the block while sync ran) is acceptable because the block is generated, not authored.
- *Single watcher per active editor vs. one per scope.* One per active editor. Multi-editor splits with two weekly files would still work because each editor switch retriggers registration; the key in the map is the URI string.

## Steps

### 1. Manifest changes (`package.json`)

1a. Add `journal.weeklySync` to `contributes.configuration.properties`:
```jsonc
"journal.weeklySync": {
  "type": "object",
  "default": {
    "enabled": true,
    "anchor": "## Daily Entries",
    "template": "- [${weekday}, ${d:MMMM DD}](${link})",
    "sortOrder": "ascending"
  },
  "description": "%configuration.journal.weeklySync.description%"
}
```

1b. Add `dailyLink` to the `journal.templates` default array:
```jsonc
{ "name": "dailyLink", "template": "- [${weekday}, ${d:MMMM DD}](${link})", "after": "## Daily Entries" }
```

1c. Update the default `weekly` template (already updated by #168) to also include the `## Daily Entries` anchor:
```jsonc
{ "name": "weekly", "template": "# Week ${week}\n\n## Tasks\n\n## Notes\n\n## Daily Entries\n\n" }
```

1d. Add NLS keys to `package.nls.json`:
- `configuration.journal.weeklySync.description`

### 2. Configuration helpers (`src/ext/conf.ts`)

2a. Local type:
```typescript
type WeeklySyncConfig = {
  enabled: boolean;
  anchor: string;
  template: string;
  sortOrder: "ascending" | "descending";
};
```

2b. `public getWeeklySyncConfig(_scopeId?: string): WeeklySyncConfig` — reads `journal.weeklySync`, falls back to defaults per field. Scope parameter accepted for forward-compat (unused in v1).

2c. `public async getDailyLinkInlineTemplate(_scopeId?: string): Promise<InlineTemplate>` — mirrors `getFileLinkInlineTemplate`, looks up the `dailyLink` template id with the `${weekday}, ${d:MMMM DD}` default.

### 3. Date utilities (`src/util/dates.ts`)

3a. `export function getDatesOfISOWeek(week: number, year: number): Date[]` — returns 7 `Date`s from Monday → Sunday of the given ISO week / weekYear using `moment().isoWeek(week).isoWeekYear(year).startOf("isoWeek")` and 6 day increments. Used by both `SyncDailyLinks` and the watcher.

### 4. URI helpers (`src/util/paths.ts`)

4a. `export async function getWeekFromURIAndConfig(uri: vscode.Uri, ctrl: J.Util.Ctrl): Promise<{ week: number; year: number; scope: string } | undefined>` — mirrors the existing `getDateFromURIAndConfig`. Iterates configured scopes (longest base first), matches the URI against each scope's resolved `weeks.path` + `weeks.file` patterns, extracts week and year via regex against the resolved template. Returns `undefined` when no match.

### 5. New feature `src/provider/features/sync-daily-links.ts`

5a. Class skeleton (per spec interface):
```typescript
export class SyncDailyLinks {
  constructor(public ctrl: J.Util.Ctrl) {}
  public async sync(doc: TextDocument, week: number, year: number, scope?: string): Promise<void>;
  public async findDailyEntriesForWeek(week: number, year: number, scope?: string): Promise<vscode.Uri[]>;
  public async renderBlock(doc: TextDocument, dailies: vscode.Uri[], scope?: string): Promise<string>;
  public async applyBlock(doc: TextDocument, anchor: string, block: string): Promise<boolean>;
}
```

5b. `findDailyEntriesForWeek`:
- Computes the seven `Date`s via `getDatesOfISOWeek(week, year)`.
- For each, resolves the entry path via `Configuration.getResolvedEntryPath` + `getEntryFilePattern`, builds the absolute file path, and runs `J.Util.fileExists` (stat-first, no open antipattern).
- Returns the URIs of existing files in date-ascending order.

5c. `renderBlock`:
- Reads `getDailyLinkInlineTemplate` and `getWeeklySyncConfig` for sort order.
- For each URI: builds a `relativePath` from the weekly doc's dir, substitutes `${weekday}`, `${d:...}`, `${link}`, `${title}` into the template via `replaceDateFormats` + `replaceVariableValue`.
- Joins lines with `\n`; if `sortOrder === "descending"`, reverses the list before joining.

5d. `applyBlock`:
- Locates the anchor line in the doc via `doc.getText().split("\n")` (one full read).
- If anchor is missing, logs `debug` and returns `false` (no edit, no error toast).
- Computes the block-end line as the next markdown heading (`/^#+\s+/`) or `doc.lineCount`.
- Compares the existing block text with the new block text. If equal (after normalizing trailing whitespace), returns `false` (idempotent no-op).
- Otherwise, uses `vscode.WorkspaceEdit` to replace the range `[anchorLine+1, blockEndLine)` with `\n${block}\n` (one leading blank, one trailing blank for markdown tidiness).

5e. `sync` orchestrates: short-circuit if `enabled=false`; otherwise invoke `find → render → apply`. Logs `info` when the block is updated.

### 6. New feature `src/provider/features/weekly-entry-watcher.ts`

6a. Class:
```typescript
export class WeeklyEntryWatcher implements vscode.Disposable {
  private activeWatcher: vscode.FileSystemWatcher | undefined;
  private activeUri: string | undefined;
  private debounceHandle: NodeJS.Timeout | undefined;

  constructor(public ctrl: J.Util.Ctrl, public sync: SyncDailyLinks) {
    this.editorListener = vscode.window.onDidChangeActiveTextEditor(e => this.handleEditorChange(e));
    this.handleEditorChange(vscode.window.activeTextEditor);
  }

  public dispose(): void { /* dispose watcher + listener */ }
}
```

6b. `handleEditorChange`:
- If the editor is undefined, dispose current watcher and return.
- Resolve `getWeekFromURIAndConfig(editor.document.uri, ctrl)`. If `undefined` (not a weekly file), dispose current watcher and return.
- If the URI string equals `activeUri`, no-op (same weekly file regained focus).
- Dispose the old watcher; register a new one with globs covering the seven daily paths of the resolved (week, year, scope).
- Trigger `sync.sync(doc, week, year, scope)` once immediately.

6c. Watcher's `onDidCreate / onDidChange / onDidDelete` all call a shared `scheduleSync()` that sets `debounceHandle` to fire after 500 ms; subsequent events cancel the previous timer.

### 7. Wire into Startup (`src/ext/startup.ts`)

7a. In `registerCommands` (or a new private `registerWeeklySync(ctrl, context)`):
```typescript
const syncDailyLinks = new J.Provider.SyncDailyLinks(ctrl);
const watcher = new J.Provider.WeeklyEntryWatcher(ctrl, syncDailyLinks);
context.subscriptions.push(watcher);
```

7b. Also invoke `syncDailyLinks.sync(doc, week, year, scope)` from `AbstractLoadEntryForDateCommand.loadPageForInput` after the `Inject.injectInput` step when `input.hasWeek()` — initial sync on weekly open from any command path. Gate on `getWeeklySyncConfig().enabled`.

### 8. Tests (`src/test/suite/issue-185-weekly-sync.test.ts`)

8a. Suite "URI helper" — `getWeekFromURIAndConfig` recognizes the default weekly pattern and returns `{week, year, scope}`; returns `undefined` for non-weekly URIs.

8b. Suite "SyncDailyLinks rendering" — pure unit tests on `renderBlock` against seeded URIs (no I/O). Cover sort order both directions, template substitution.

8c. Suite "SyncDailyLinks orchestration" — seed three daily files for week N, open the weekly file, run `sync`, assert the file content under `## Daily Entries` matches the expected three lines in ascending order.

8d. Suite "Idempotency" — call `sync` twice with no FS changes between; assert the second call returns `applied=false` and the file mtime / content is unchanged.

8e. Suite "Missing anchor" — open a weekly file without `## Daily Entries`; run `sync`; assert no edit and one debug message logged.

8f. Suite "Watcher lifecycle" — instantiate `WeeklyEntryWatcher`, simulate editor change to a weekly file (assert watcher registered), then to a non-journal file (assert previous watcher disposed). Spy on `FileSystemWatcher.dispose`.

8g. Suite "Settings" — `getWeeklySyncConfig` defaults, override individual fields, verify defaults survive when only one field is customized.

8h. Regression: existing `phase1-regression.test.ts:10` weekly template test must remain green against the new default template (`## Daily Entries` heading appended).

### 9. Docs

9a. `docs/settings.md` — new "Weekly Sync" subsection under "Other options", documenting `journal.weeklySync` fields and explaining the daily-link auto-sync behavior. Cross-link to the new `docs/weekly-entries.md`.

9b. `docs/weekly-entries.md` (new) — full feature page: how the sync works, where the anchor lives, the default template variables, how to customize for users with non-default weekly templates, the "missing anchor" graceful degradation.

### 10. CHANGELOG

10a. New `### Added` entry under `## Unreleased`:
```markdown
* [Issue #185](https://github.com/pajoma/vscode-journal/issues/185) Weekly entries now auto-sync a list of links to all daily entries in the same ISO week, kept up to date while the weekly file is the active editor. New `journal.weeklySync` setting block (`enabled`, `anchor`, `template`, `sortOrder`) controls the behavior. Default `weekly` template ships with a `## Daily Entries` heading; user-customized templates without the anchor are skipped silently. Daily files are never modified — sync is one-directional.
```

### 11. PR

Will be opened as a bundled PR for #168 + #185 after this implementation lands. Body references both issues and uses `Fixes #168` + `Fixes #185` keywords.

## Test scenarios

| # | Scenario | Type | Asserts |
|---|----------|------|---------|
| W1 | `getWeekFromURIAndConfig` on a default weekly path returns `{week, year, scope}` | unit | parses the resolved pattern |
| W2 | `getWeekFromURIAndConfig` on a non-journal URI returns `undefined` | unit | safe negative |
| W3 | `getWeeklySyncConfig` returns the documented defaults when unset | unit | structural equality |
| W4 | `getWeeklySyncConfig` reads individual user overrides without dropping defaults | unit | partial override merges |
| W5 | `SyncDailyLinks.findDailyEntriesForWeek` returns existing daily URIs only, sorted ascending | integration | seed Mon/Wed/Fri, assert 3 URIs in date order |
| W6 | `SyncDailyLinks.renderBlock` substitutes weekday + link variables | unit | rendered output matches expected lines |
| W7 | `SyncDailyLinks.renderBlock` honors `sortOrder=descending` | unit | output reversed |
| W8 | `SyncDailyLinks.sync` injects the block under `## Daily Entries` (golden path) | integration | file content updated, no errors logged |
| W9 | `SyncDailyLinks.sync` is idempotent on second call with same state | integration | second call applies no edit |
| W10 | `SyncDailyLinks.sync` skips silently when anchor is missing | integration | no edit, debug log present |
| W11 | `SyncDailyLinks.sync` respects `enabled=false` | integration | no edit even when anchor present |
| W12 | `WeeklyEntryWatcher` registers a watcher when active editor becomes a weekly file | integration | spy on watcher creation |
| W13 | `WeeklyEntryWatcher` disposes the previous watcher when editor changes away from weekly | integration | spy on dispose |
| W14 | Creating a new daily file while weekly is active triggers a sync within 500ms | integration | wait 700ms, assert file updated |
| W15 | Deleting a daily file while weekly is active removes the line | integration | same pattern as W14 |
| W16 | Default `weekly` template includes `## Daily Entries` heading | unit | `getWeeklyTemplate(7).value` contains the substring |
| W17 | #167 + #168 regression assertions stay green | regression | run existing tests in suite |

## Dependencies

- **Builds on #168** (same branch): `getCurrentISOWeek`, `getISOWeekYear`, and the updated `weekly` template default already exist after #168's commits. #185 layers `## Daily Entries` on top.
- **Reuse:** `fileExists` (#51), `getDateFromURIAndConfig` pattern (#144), `SyncNoteLinks` shape (#103 era).

## Risk

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| FS watcher fires for unrelated file changes inside the same year directory and re-syncs needlessly | medium | Scope the watcher glob to the seven specific daily file paths of the active week, not a broad directory match. Debounce 500ms. |
| User keeps cursor inside the `## Daily Entries` block while sync runs and edit shifts their cursor | low | Sync only on FS events, not on text changes. The user does not type inside the synced block in normal workflow. |
| Anchor detection is fragile for users who heavily customize weekly template | medium | Anchor is the *exact configured string* matched against any line in the file. Skip silently if not found; log a debug message. Document the customization path in `docs/weekly-entries.md`. |
| `getWeekFromURIAndConfig` mismatches paths under unusual `journal.patterns.weeks` overrides | low | Build the regex from the resolved pattern itself (replace `${year}` with `(\d{4})`, `${week}` with `(\d{1,2})`); document supported substitution variables in the helper's JSDoc. |
| Default weekly template change tripping `phase1-regression.test.ts:10` (asserts `tpl.value.includes("7")`) | low | The `${week}` substitution still runs; W16/W17 verify. |
| Two PRs combined (#168 + #185) increases blast radius of any rollback | medium | Keep commits granular and atomic so individual revert is easy. Final PR description lists both issues; if one needs revert, `git revert <commit>` is per-feature. |

## Rollback

- `journal.weeklySync.enabled = false` disables the feature without revert.
- For a hard revert, `git revert` the implementation commits (one for the feature, one for the watcher, one for the manifest changes). The `## Daily Entries` heading remains in user files but is harmless content.
- The default weekly template change can be soft-reverted by users editing `journal.templates` directly.

## Reference

- Spec: [docs/specs/2026-05-14-feat-185-weekly-daily-link-sync.md](../specs/2026-05-14-feat-185-weekly-daily-link-sync.md)
- Sibling: [docs/plans/2026-05-14-feat-168-weekly-entry-granularity.md](2026-05-14-feat-168-weekly-entry-granularity.md)
- Reference patterns:
  - `src/provider/features/sync-note-links.ts` — feature shape
  - `src/util/paths.ts` (`getDateFromURIAndConfig`) — URI → metadata helper template
  - `src/util/fs-exists.ts` — stat-first existence check
  - `src/util/dates.ts` (`getCurrentISOWeek`, `getISOWeekYear`) — ISO week helpers added in #168
