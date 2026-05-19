# Plan — Feature #168: Weekly Entry Granularity

**Issue:** [pajoma/vscode-journal#168](https://github.com/pajoma/vscode-journal/issues/168)
**Spec:** [docs/specs/2026-05-14-feat-168-weekly-entry-granularity.md](../specs/2026-05-14-feat-168-weekly-entry-granularity.md)
**Branch:** `168-possible-to-use-weekly-instead-of-daily-for-memos-ect`
**Date:** 2026-05-14
**Status:** Draft — awaiting approval on issue.

## Approach

The granularity decision is **purely additive**. We introduce a single global setting (`journal.entryGranularity`) and translate "no explicit date target + granularity=weekly" into `input.week = currentISOWeek()` at the command layer, immediately before the existing `Reader.loadEntryForInput` routing kicks in. Because `Reader` already routes `input.hasWeek()` → `loadEntryForWeek`, and `Inject.injectInput` runs against whatever document the reader returned, every downstream consumer keeps its current contract — no changes in `Reader`, `Inject`, or `MatchInput`.

For new notes (`journal:note`), the granularity check sits inside `LoadNotes` where path resolution already happens — that file becomes the only consumer of the new `journal.patterns.weeklyNotes` shape.

**Trade-off considered:** an alternative is to push the decision down into `MatchInput.parseInput()` so the resulting `Input` already carries the right `week`. Rejected because `MatchInput` is text-grammar logic and should remain orthogonal to user preferences; configuration leaks into a parser would be a smell. The command-layer integration is one decision per command call, which is symmetric to how scope already gets resolved at that layer.

**Smart-input grammar is untouched.** `w20`, `week 20`, `+0`, `2026-05-14`, weekday names all keep their current meaning. Granularity only kicks in when the parsed `Input` is "bare" (no `hasOffset()`, no `hasWeek()`).

## Steps

### 1. Manifest changes (`package.json`)

1a. Add `journal.entryGranularity` enum setting under `contributes.configuration.properties`:
   ```jsonc
   "journal.entryGranularity": {
     "type": "string",
     "enum": ["daily", "weekly"],
     "default": "daily",
     "description": "%configuration.journal.entryGranularity.description%"
   }
   ```

1b. Extend the `journal.patterns` default object with a `weeklyNotes` block, sibling to `notes` / `entries` / `weeks`:
   ```jsonc
   "weeklyNotes": {
     "path": "${base}/${year}/w${week}",
     "file": "${input}.${ext}"
   }
   ```

1c. Replace the default `weekly` entry inside `journal.templates`:
   ```jsonc
   { "name": "weekly", "template": "# Week ${week}\n\n## Tasks\n\n## Notes\n\n" }
   ```

1d. Add NLS key to `package.nls.json`:
   ```jsonc
   "configuration.journal.entryGranularity.description": "Whether memos, tasks, and new notes default to today's daily entry (`daily`) or the current week's weekly entry (`weekly`) when no explicit date target is given. Explicit input (date offset, ISO date, weekday, week number) always overrides this setting."
   ```
   No fan-out to locale `package.nls.<loc>.json` files needed (per CLAUDE.md: configuration descriptions are not localized today).

### 2. Configuration helpers (`src/ext/conf.ts`)

2a. Extend the local `PatternDefinition` type at the top of `conf.ts` to include the new `weeklyNotes` shape.

2b. Add `getEntryGranularity()`:
   ```typescript
   public getEntryGranularity(_scopeId?: string): "daily" | "weekly" {
     const raw = this.config.get<string>("entryGranularity");
     return raw === "weekly" ? "weekly" : "daily";
   }
   ```
   Scope is accepted but ignored for v1 (spec: scope-specific granularity is out of scope; the parameter exists so we don't have to change the signature later when we add it).

2c. Add `getWeeklyNotesPathPattern(_scopeId?)`, `getResolvedWeeklyNotesPath(week, year, _scopeId?)`, `getWeeklyNotesFilePattern(week, year, input, _scopeId?)`. Mirror the existing `getNotesPathPattern` / `getResolvedNotesPath` / `getNotesFilePattern` (lines 280–370 of `conf.ts`) but resolve `${week}` and `${year}` instead of `${month}`/`${day}`. Reuse `replaceVariableValue` and `replaceDateFormats` from `src/util/strings.ts`.

### 3. Granularity hook in command layer (`src/provider/commands/show-entry-for-date.ts`)

3a. In `AbstractLoadEntryForDateCommand.execute(input)`, immediately after the entry guard and before `promptLocalOrRemoteInRemoteSession`, add:
   ```typescript
   this.applyEntryGranularity(input);
   ```

3b. Define `protected applyEntryGranularity(input: J.Model.Input): void`:
   ```typescript
   protected applyEntryGranularity(input: J.Model.Input): void {
     if (input instanceof J.Model.NoteInput) { return; }      // notes handled separately
     if (input instanceof J.Model.SelectedInput) { return; }  // explicit file path
     if (input.hasWeek()) { return; }                          // explicit week wins
     if (input.hasOffset()) { return; }                        // explicit offset wins (incl. "today" / "+0")

     if (this.ctrl.config.getEntryGranularity() === "weekly") {
       input.week = J.Util.getCurrentISOWeek(new Date());
     }
   }
   ```
   `getCurrentISOWeek` exists implicitly via `moment().week()` (used in `src/test/suite/week-input.test.ts`); expose it as a util in `src/util/dates.ts` for clean reuse — single line wrapper, no behavior change.

3c. **Verify `hasOffset()` semantics for a bare smart input.** Empirical check: run `MatchInput.parseInput("memo: buy milk")` and assert `hasOffset()` is false. The model code (`input.ts:140`) returns `!isNaN(this.offset) && this._week === -1`. If the bare default `_offset = 0` would return `true` here, MatchInput must explicitly set `_offset = NaN` for the "no date provided" path — confirm in `match-input.ts` and fix the parser if needed (this is a parser-correctness bug regardless of #168). One short unit test pins this contract.

### 4. Notes routing (`src/provider/features/load-note.ts`)

4a. In `LoadNotes`, before resolving the notes path, check granularity:
   ```typescript
   const granularity = this.ctrl.config.getEntryGranularity(this.input.scope);
   if (granularity === "weekly") {
     // resolve via getResolvedWeeklyNotesPath / getWeeklyNotesFilePattern
   } else {
     // existing path: getResolvedNotesPath / getNotesFilePattern
   }
   ```
4b. The week number / year used for resolution comes from `J.Util.getCurrentISOWeek(input.date ?? new Date())`. `LoadNotes` already has access to either the user-provided date or "now".

### 5. Tests (`src/test/suite/`)

5a. New file `src/test/suite/issue-168-entry-granularity.test.ts`. Test scenarios listed below. Follow the established pattern in `commands-prev-next.test.ts` and `issue-51-remote-create.test.ts`: fresh `Ctrl` per test, `TestLogger` with `errors[]` accumulator, monkey-patch `(ctrl.ui as any).openDocument`, restore in teardown.

5b. Add one assertion to `phase1-regression.test.ts` (or a new test in the new file): the updated default `weekly` template still resolves with `${week}` substituted (the existing `#167` test asserts `tpl.value.includes("7")` — verify it still passes against `"# Week ${week}\n\n## Tasks\n\n## Notes\n\n"`).

### 6. Docs (`docs/`)

6a. `docs/settings.md` — new "Entry granularity" section under "Other options", mirroring the "Navigation Mode" entry added in #144.

6b. `docs/memos.md`, `docs/tasks.md`, `docs/notes.md` — one short paragraph each explaining the granularity setting and the explicit-override rule.

6c. `docs/weekly-entries.md` — new page (or extend the existing weekly entry docs if any) covering the default template, the `## Tasks` / `## Notes` anchors, and the path pattern for weekly notes.

### 7. CHANGELOG (`CHANGELOG.md`)

7a. New entry under `## Unreleased / ### Added`:
   ```markdown
   * [Issue #168](https://github.com/pajoma/vscode-journal/issues/168) New setting `journal.entryGranularity` (`daily` default, `weekly` alternative) routes memos, tasks, and new notes into the current week's entry / weekly notes folder when no explicit date target is given. Explicit date input (offset, ISO date, weekday, week number) still wins. Default `weekly` template now includes `## Tasks` and `## Notes` sections; new `journal.patterns.weeklyNotes` default controls the weekly notes path.
   ```

### 8. Open PR with `Fixes #168`

Targets `develop`. Title: `feat(granularity): journal.entryGranularity routes memos/tasks/notes weekly (#168)`.

## Test scenarios

Each scenario maps to an acceptance criterion from the spec.

| # | Scenario | Type | Asserts |
|---|----------|------|---------|
| T1 | `getEntryGranularity` defaults to `"daily"` when setting is unset | unit | `conf.getEntryGranularity()` returns `"daily"` |
| T2 | `getEntryGranularity` returns `"weekly"` when setting is `"weekly"` | unit | after `config.update("entryGranularity", "weekly", Workspace)`, returns `"weekly"` |
| T3 | Granularity hook is a no-op when `input.hasOffset()` | unit | input with `_offset=0` (today), `_week=-1`, granularity=`weekly` → `applyEntryGranularity` leaves `hasWeek()=false` |
| T4 | Granularity hook is a no-op when `input.hasWeek()` | unit | input with `_week=20`, granularity=`weekly` → `applyEntryGranularity` leaves `_week=20` (no mutation) |
| T5 | Granularity hook flips bare input to current week when granularity=`weekly` | unit | input with `_offset=NaN`, `_week=-1`, granularity=`weekly` → `applyEntryGranularity` sets `_week=currentISOWeek()` |
| T6 | `MatchInput.parseInput("memo: buy milk")` leaves `hasOffset()` false | unit | empirical contract pin for the parser; required for T5 hook to fire |
| T7 | End-to-end: smart input "memo: buy milk" with granularity=`weekly` opens the week's weekly file and injects memo under header | integration | weekly file exists at the configured weekly path; memo line is present; logger has no errors |
| T8 | End-to-end: smart input "memo: buy milk" with granularity=`daily` opens today's daily file (regression) | integration | daily file path matches; memo line is present; logger has no errors |
| T9 | End-to-end: smart input "+0 task fix bug" with granularity=`weekly` opens today's daily file (explicit-wins) | integration | daily file opened, NOT weekly |
| T10 | End-to-end: smart input "w20 task plan release" with granularity=`daily` opens week 20's weekly file (explicit-wins) | integration | weekly file for week 20 opened, NOT daily |
| T11 | `LoadNotes` with granularity=`weekly` resolves path under `weeklyNotes` pattern | integration | created note file path matches `${base}/${year}/w${week}/${input}.${ext}` |
| T12 | `LoadNotes` with granularity=`daily` resolves path under `notes` pattern (regression) | integration | created note file path matches current default `${base}/${year}/${month}/${day}/${input}.${ext}` |
| T13 | Default `weekly` template resolves to include `## Tasks` and `## Notes` sections | unit | `getWeeklyTemplate(7).value` contains both substrings |
| T14 | #167 regression test still passes against new default template | regression | existing `phase1-regression.test.ts:10` continues green |

Unit tests live in the new `issue-168-entry-granularity.test.ts`; integration tests share that file (the established convention for the previous bug-numbered test files).

## Dependencies

- **Builds on:** #167 — fix merged in PR #183 (already in `develop` per current branch base). User-customized weekly templates now resolve correctly, which #168 needs so users can edit the template to taste once granularity flips them onto the weekly file.
- **Should not block:** #185 (weekly page auto-sync of daily entry links) — that issue is complementary but independent. #168 can ship first; #185 can come later and key off the same `weekly` template structure.
- **No upstream PR blockers.**

## Risk

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Default `weekly` template change breaks the #167 regression test (asserts `tpl.value.includes("7")`) | low | The `${week}` substitution still runs against the new template; assertion remains true. Verified by T14. |
| `hasOffset()` returning `true` for bare input prevents the hook from firing | medium | T6 pins the parser contract. If broken, fix `MatchInput` to set `_offset = NaN` when no date capture group matched. |
| `journal.patterns.weeklyNotes` new shape breaks existing `PatternDefinition` type narrowing | low | Type is local to `conf.ts`. Add the field; existing users without it fall back to defaults via `defaultPatternDefinition`. |
| Scope users surprised that scoped memos still go to daily entries under granularity=`weekly` | low | Spec called this out as out-of-scope for v1. Documented in `docs/settings.md` as a known limitation. |
| Watcher / sync feature (#185) assumes daily-default and breaks | n/a | #185 is not yet implemented; the issue body already cross-links #168 and will be designed against the new defaults. |
| `MatchInput` regex change required to recognize "memo" without a date prefix | medium | If `MatchInput` currently *only* sets `flags=memo` when a date capture group fires, the bare input "memo: buy milk" might not be classified as a memo. Run T6/T7 early in implementation to catch this. If broken, the parser fix is small (the existing fallback at `match-input.ts:69` already handles "text but no flags" — likely already correct). |

## Rollback

If the feature ships broken and we need to disable it post-release without reverting:

1. The setting defaults to `"daily"`, so users who don't opt in are unaffected.
2. Users who opted in and hit a bug can set `journal.entryGranularity = "daily"` and continue.
3. If full revert is needed: revert the PR. The setting becomes inert (VS Code ignores unknown settings); no migration needed.
4. The default weekly template change is a soft revert risk — users who already opened a weekly entry on the new default will have `## Tasks` / `## Notes` sections in their existing files. That is content, not config, and revert won't touch it (per spec, no file migration). Acceptable.

## Reference

- Spec: [docs/specs/2026-05-14-feat-168-weekly-entry-granularity.md](../specs/2026-05-14-feat-168-weekly-entry-granularity.md)
- Related issues: #167 (just merged), #103 (original weekly feature), #185 (complementary follow-up — weekly auto-sync)
- Reference patterns:
  - `src/provider/features/load-note.ts` — note creation flow
  - `src/provider/commands/show-entry-for-date.ts:37` — `AbstractLoadEntryForDateCommand.execute` integration point
  - `src/ext/conf.ts:280-370` — notes path resolution to mirror for `weeklyNotes`
  - `src/test/suite/phase1-regression.test.ts:10` — `#167` regression test (must remain green)
  - `src/test/suite/commands-prev-next.test.ts` — test pattern template (fresh `Ctrl`, `TestLogger.errors[]`, monkey-patch seams)
