# Plan — Issue #232: Note creation linked to specific day

> **Spec:** [docs/specs/2026-06-01-232-note-for-specific-day.md](../specs/2026-06-01-232-note-for-specific-day.md)
> **Issue:** [pajoma/vscode-journal#232](https://github.com/pajoma/vscode-journal/issues/232)
> **Branch:** `feat/177-smart-input-tokenizer` (append to open PR #231, or `feat/232-note-for-specific-day` post-merge)
> **Created:** 2026-06-01

## Approach

Two one-line fixes. The tokenizer (PR #231) already puts the correct offset on `Input`. Both call sites that ignore it are patched to use `input.generateDate()` instead of today. No new abstractions; `generateDate()` already handles the `date`-first / `offset`-fallback logic.

**Trade-off:** Sharing the branch with #177 avoids a second PR and ships the feature immediately. Downside: slightly wider diff in one PR. Keeping it separate is cleaner history but delays the feature until after merge. Either works; default to appending to #177 since PR is open and the diff is trivial.

## Steps

1. **`src/journal/parser.ts` line 48** — replace `const date = new Date()` with `const date = input.generateDate()`. One line. `resolveNotePathForInput` uses `date` for both `getNotesFilePattern` and `getResolvedNotesPath` — both resolve correctly for any offset.

2. **`src/features/entries/load-note.ts` line 28** — replace `new J.Model.Input(0)` with:
   ```ts
   (() => { const e = new J.Model.Input(this.input.offset); e.date = this.input.date; e.scope = this.input.scope; return e; })()
   ```
   Or extract as a two-line local variable for readability. Forwards offset, date, and scope so `loadEntryForInput` opens the correct day's entry.

3. **Add regression tests** in `src/test/suite/notes-sync.test.ts` (or a new `notes-link-offset.test.ts`):
   - `offset=+2 PrepareDemo` → entry linked is day-after-tomorrow (spy `loadEntryForInput`)
   - `offset=0 TodayNote` → entry linked is today (existing behaviour, no regression)
   - `resolveNotePathForInput` with `offset=+2` → returned path contains day-after-tomorrow's date segments

## Test scenarios

| Scenario | Input | Expected |
|----------|-------|----------|
| Default — no prefix | `NoteInput(offset=0, text="MyNote")` | note linked to today's entry |
| Weekday offset | `NoteInput(offset=Monday's offset, text="SecurityCodeReview")` | note linked to Monday's entry |
| Positive numeric offset | `NoteInput(offset=2, text="PrepareDemo")` | note linked to day+2 entry |
| Negative numeric offset | `NoteInput(offset=-1, text="YesterdayNote")` | note linked to yesterday's entry |
| Path resolution uses offset | `resolveNotePathForInput(offset=2)` | returned path under day+2 date dir |
| No regression — sync | existing notes-sync test | note linked to today's entry, link injected |

## Dependencies

- **PR #231 / #177 tokenizer** — `parseInput` must return correct `offset` from temporal prefix before this lands. Both changes are inert for `offset=0` so no breakage if committed alongside #177.

## Risk

| Risk | Mitigation |
|------|-----------|
| `this.input` is `Input` cast to `NoteInput` — offset may be 0 if `ShowNoteCommand` fails to call `parseInput` | `parseInput` is already called before `LoadNotes` in `ShowNoteCommand.execute()`; offset is set correctly |
| `resolveNotePathForInput` weekly granularity path uses `getCurrentISOWeek(date)` — correct week derived from `generateDate()` | `generateDate()` returns a valid `Date` for any offset; `getCurrentISOWeek` accepts any `Date` |
| `input.scope` not forwarded to entry link | Step 2 explicitly forwards scope — scoped entries link to correct scope's journal |

## Rollback

Revert two lines (one per file). No schema changes, no config changes. Safe.

## Reference spec

[docs/specs/2026-06-01-232-note-for-specific-day.md](../specs/2026-06-01-232-note-for-specific-day.md)
