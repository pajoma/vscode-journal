# Spec — Feature #168: Weekly Entry Granularity

**Issue:** [pajoma/vscode-journal#168](https://github.com/pajoma/vscode-journal/issues/168)
**Branch:** `168-possible-to-use-weekly-instead-of-daily-for-memos-ect`
**Date:** 2026-05-14
**Status:** Draft — awaiting approval on issue.

## Goal

Let users default-route memos, tasks, and new notes into the current week's journal entry (and a weekly notes folder) instead of today's daily entry, while keeping explicit date input (`+0`, `2026-05-14`, weekday names) working as-is.

## Why now

Issue #168 (assigned to @pajoma, milestone 1.1.0) was opened by @swoopdk: their personal workflow is weekly-granular, so a daily entry per day produces too many files. They want one entry per week and need the quick-add memo / task features to land in that weekly file. The current code already supports inline injection into a weekly entry when the user explicitly types `w20 task ...`, but there is no way to make weekly the default — so every quick memo requires typing the `w` prefix. The setting should make the weekly workflow first-class.

## In scope

- New configuration setting `journal.entryGranularity`: enum, allowed values `"daily"` (default) and `"weekly"`.
- When `entryGranularity = "weekly"`, smart-input commands that have **no explicit date target** (no offset, no ISO date, no weekday, no week number) route the resulting entry to the **current ISO week's** weekly entry (using the existing weekly path pattern) instead of today's daily entry.
- Inline injection of memo / task into the weekly entry. The injection plumbing (`Inject.injectInput`) already runs against whatever document the reader returned, so this works automatically once the reader hands back a weekly doc.
- New notes pattern `journal.patterns.weeklyNotes` (path + file) used when `entryGranularity = "weekly"`. Default:
  ```json
  "weeklyNotes": {
    "path": "${base}/${year}/w${week}",
    "file": "${input}.${ext}"
  }
  ```
- Default `weekly` template in `journal.templates` gains `## Tasks` and `## Notes` sections, so the inline memo / task injection `after` anchors (`## Tasks`) match. New default:
  ```
  # Week ${week}\n\n## Tasks\n\n## Notes\n\n
  ```

## Out of scope

- Per-type granularity (separate settings for memos vs tasks vs notes). Single global toggle for v1; we can split later if requested.
- Scope-specific granularity (granularity is global; scopes still control path patterns and templates independently).
- Migration / move-on-disk of files created under the old (daily) layout. Users switching mid-stream keep both layouts side by side.
- Changing the default `entries` (daily) pattern — daily entries still exist, granularity only chooses the default *target*.
- Per-scope override of `entryGranularity` (could be added later under `journal.scopes[].entryGranularity`).
- Smart-input grammar changes — the existing `w`, `week`, `w20` tokens still work and still win as explicit input.

## Acceptance criteria

1. Setting `journal.entryGranularity` is registered in `package.json` with enum `["daily", "weekly"]`, default `"daily"`, and is documented in `docs/settings.md`.
2. With `entryGranularity = "daily"` (default), behavior is unchanged: smart input `memo: buy milk` injects into today's entry under `## Tasks`. The existing `phase1-regression.test.ts` continues to pass without modification.
3. With `entryGranularity = "weekly"`:
   - `memo: buy milk` (no date prefix) injects into the current week's weekly entry (`Journal/2026/week_<week>.md` per default pattern) under `## Tasks`.
   - `task pay rent` (no date prefix) injects into the same weekly entry.
   - `note: Project Ideas` creates a file under the new weekly notes pattern (`Journal/2026/w<week>/Project_Ideas.md` per default).
4. With `entryGranularity = "weekly"`, explicit date input still wins:
   - `+0 task fix bug` injects into today's daily entry.
   - `2026-05-13 memo: groceries` injects into the daily entry for 2026-05-13.
   - `w20 task plan release` injects into week 20's weekly entry (already worked).
5. Default `weekly` template in `journal.templates` renders `# Week ${week}\n\n## Tasks\n\n## Notes\n\n` so inline injection `after` anchors match.
6. Setting label and description appear in all 11 locale `package.nls*.json` files for the manifest label; runtime user-facing strings (if any new toasts are introduced) added to `l10n/bundle.l10n.<loc>.json`.
7. `npm run check` (lint + compile + test) passes.

## Entities / contracts / interfaces

### Settings (manifest)

```jsonc
// package.json
"journal.entryGranularity": {
  "type": "string",
  "enum": ["daily", "weekly"],
  "default": "daily",
  "description": "%configuration.journal.entryGranularity.description%"
}
```

```jsonc
// package.json — journal.patterns default gains:
"weeklyNotes": {
  "path": "${base}/${year}/w${week}",
  "file": "${input}.${ext}"
}
```

```jsonc
// package.json — journal.templates default for "weekly" becomes:
{ "name": "weekly", "template": "# Week ${week}\n\n## Tasks\n\n## Notes\n\n" }
```

### Configuration helper API

```typescript
// src/ext/conf.ts
type EntryGranularity = "daily" | "weekly";

class Configuration {
  // new:
  public getEntryGranularity(_scopeId?: string): EntryGranularity;
  public getWeeklyNotesPathPattern(_scopeId?: string): string;
  public async getResolvedWeeklyNotesPath(week: number, year: number, _scopeId?: string): Promise<ScopedTemplate>;
  public async getWeeklyNotesFilePattern(week: number, year: number, input: string, _scopeId?: string): Promise<ScopedTemplate>;
}
```

### Input-resolution hook

```typescript
// In MatchInput.parseInput (or its post-processing) — after the regex match has produced a candidate Input:
//   if (input has no offset && no week && no iso date && !input.hasFlags()-of-notes-only) {
//       const granularity = config.getEntryGranularity();
//       if (granularity === "weekly") {
//           input.week = currentISOWeek(today);  // sets hasWeek()=true
//       }
//   }
// Exact integration point: TBD in plan; cleanest is probably to inject the granularity decision in the command layer (InsertMemoCommand / ShowEntryForInputCommand) before calling super.execute(input), so MatchInput stays purely text-parsing.
```

### Reader routing (unchanged contract)

```typescript
// src/actions/reader.ts — already routes:
public async loadEntryForInput(input: Input): Promise<TextDocument> {
  if (input.hasWeek()) { return this.loadEntryForWeek(input.week); }
  return this.loadEntryForDay(input.generateDate());
}
```
Nothing in Reader needs to change. The granularity decision is made earlier (at command layer or in `MatchInput` post-processing) and surfaces as `input.week` being set.

### LoadNotes (weekly variant)

```typescript
// src/provider/features/load-note.ts — adjusts path resolution:
//   if (granularity === "weekly") use getResolvedWeeklyNotesPath/getWeeklyNotesFilePattern
//   else (current behavior) use getResolvedNotesPath/getNotesFilePattern
```

## Constraints

- **Backwards compatibility:** default value must be `"daily"`. Existing users see no change unless they opt in.
- **Scope isolation:** granularity is global for v1. A scoped user (`pers task buy milk`) still uses the daily entry under that scope, ignoring the global granularity setting. Documented as a known limitation.
- **i18n:** new setting key must be added to `package.nls.json` for the English/default description. Locale files (`package.nls.<loc>.json`) only carry command titles today (per CLAUDE.md), so no fan-out needed there. If we introduce a runtime toast (e.g., "Switched to weekly granularity"), all 11 `l10n/bundle.l10n.<loc>.json` files need the new key.
- **ISO week numbering:** must match the existing `${week}` variable used by `journal.patterns.weeks.file` and `getWeeklyTemplate`. Confirm by reusing the same week-number helper (currently provided via moment-via-`getCurrentWeek` or similar — to be located in implementation).
- **No moment-only paths added:** PLAN.md Phase 3 is replacing moment with `Intl` / `date-fns`. New code should use the same helper the rest of the codebase uses today (consistency over premature migration), so the eventual cutover is mechanical.

## Open questions

None blocking. The smart-input integration point (command layer vs `MatchInput` post-processing) is a plan-stage decision, not a spec-stage one.

## Related issues

- **Builds on:** #167 (weekly template name fix, just merged in #183) — the `getWeeklyTemplate` lookup now correctly resolves user overrides, which #168 relies on so users can customize the weekly template if they want.
- **Related:** #103 (original weekly entries feature) — this is a follow-up that makes weekly entries the *default* target, not just an opt-in.
- **No blockers.**

## Notes for the implementer

- Keep changes additive. Do not touch the existing daily routing path.
- Watch out for the `phase1-regression.test.ts:10` weekly template test — it asserts `tpl.value` includes `"7"` (the week number) on the bare default template. Updating the default template to include `## Tasks\n\n## Notes\n\n` keeps the assertion green (the `${week}` substitution still runs) but verify before opening the PR.
- The current `getNotesFilePattern` signature takes `(date, input, scopeId)`. The weekly variant takes `(week, year, input, scopeId)` — there's no `Date` because the path is keyed off the week, not a calendar day. Don't try to retrofit a `Date` argument; the two pattern resolvers should be siblings, not subclasses.
