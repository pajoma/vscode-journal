# Plan — Issue #230: Smart input week-text boundary and 2-letter weekday aliases

> **Spec:** [docs/specs/2026-06-01-fix-230-smart-input-week-and-weekday-aliases.md](../specs/2026-06-01-fix-230-smart-input-week-and-weekday-aliases.md)
> **Issue:** [pajoma/vscode-journal#230](https://github.com/pajoma/vscode-journal/issues/230)
> **Branch:** `feat/177-smart-input-tokenizer` (implemented alongside #177)
> **Created:** 2026-06-01

## Approach

Both bugs are addressed in the #177 tokenizer branch. Bug 1 is already resolved by the tokenizer's architecture — `recognizeWeek` uses `(?=\s|$)` as a zero-width lookahead so no character is consumed from the following text. Bug 2 requires adding `mo`, `tu`, `we`, `th` to `weekdayVocab()` (plus `fr` is already covered by the German section). `getDayOfWeekForString` in `dates.ts` already maps all five 2-letter forms correctly; only the vocab recognizer needs updating.

**Trade-off:** `we` and `th` are common English words; adding them as standalone weekday tokens introduces the same ambiguity class as German `di`/`do`. This is accepted per spec: the tokenizer marks them `ambiguous` (≤3 chars), which triggers the yellow border feedback in the QuickPick.

## Steps

1. **Verify Bug 1 is resolved** — add regression test: `parseInput("task week Finalize Shoppinglist")` → `flags="task"`, `text="Finalize Shoppinglist"`, `hasWeek()=true`. No code change needed.

2. **Add 2-letter English aliases to `weekdayVocab()`** — append `'mo', 'tu', 'fr'` after the 3-letter English block (`mon/tue/wed/thu/fri/sat/sun`). `we` and `th` excluded: both are high-frequency English words that would destructively consume text. `fr` already present in German section; adding it to English section makes intent explicit (same result from `getDayOfWeekForString`). Longest-first ordering preserved.

3. **Invalidate pattern cache** — `_weekdayPatterns` is built lazily from `weekdayVocab()`. Adding entries to the array changes the return value; since the cache is built per `MatchInput` instance, no reset needed.

4. **Add regression tests** to `src/test/suite/match-input-vocab.test.ts`:
   - `"task week Finalize Shoppinglist"` → Bug 1 regression
   - `"mo"`, `"tu"`, `"we"`, `"th"`, `"fr"` each → correct weekday offset (same as 3-letter form)
   - `"w15"` → week 15, no regression from `recognizeWeekNum` priority

## Test scenarios

| Scenario | Input | Expected |
|----------|-------|----------|
| Bug 1 regression — week+text | `"task week Finalize Shoppinglist"` | flag=task, text="Finalize Shoppinglist", hasWeek=true |
| Bug 1 regression — week alone | `"week"` | hasWeek=true, no crash |
| Bug 1 regression — w15 still numeric | `"w15"` | week=15 |
| 2-letter alias mo | `"mo"` | same offset as `"mon"` |
| 2-letter alias tu | `"tu"` | same offset as `"tue"` |
| 2-letter alias fr | `"fr"` | same offset as `"fri"` |
| No alias we/th | `"we"`, `"th"` | text-only (not weekday aliases — collision risk) |
| No regression — task do | `"task do the shopping"` | flag=task, text="the shopping" (do = German Thursday) |

## Dependencies

- **Requires #177 tokenizer branch** — all changes land in `feat/177-smart-input-tokenizer`. This issue closes together with #177 in the same PR.

## Risk

| Risk | Mitigation |
|------|-----------|
| `we`/`th` collision with English words | Excluded from aliases — not added |
| `fr` duplication (English + German section) | `getDayOfWeekForString("fr", locale)` returns 5 (Friday) for all locales — result identical |
| `_weekdayPatterns` cache stale | Cache is per-instance, built lazily on first `recognizeWeekday` call — no stale state possible |

## Rollback

Part of #177 PR. Revert the `weekdayVocab()` addition (two lines) if 2-letter aliases cause regressions after release.

## Reference spec

[docs/specs/2026-06-01-fix-230-smart-input-week-and-weekday-aliases.md](../specs/2026-06-01-fix-230-smart-input-week-and-weekday-aliases.md)
