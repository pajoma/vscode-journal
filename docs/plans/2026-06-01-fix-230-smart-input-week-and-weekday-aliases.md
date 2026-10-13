# Plan — Issue #230: Smart input week-text boundary fix

> **Spec:** [docs/specs/2026-06-01-fix-230-smart-input-week-and-weekday-aliases.md](../specs/2026-06-01-fix-230-smart-input-week-and-weekday-aliases.md)
> **Issue:** [pajoma/vscode-journal#230](https://github.com/pajoma/vscode-journal/issues/230)
> **Branch:** `feat/177-smart-input-tokenizer` (implemented alongside #177)
> **Created:** 2026-06-01

## Approach

Bug 1 (week-text boundary) is already resolved by the #177 tokenizer's architecture — `recognizeWeek` uses `(?=\s|$)` as a zero-width lookahead so no character is consumed from the following text. No code change needed; only regression tests required.

2-letter English aliases are out of scope — 3-letter forms are the supported standard.

## Steps

1. **Verify Bug 1 is resolved** — add regression test: `parseInput("task week Finalize Shoppinglist")` → `flags="task"`, `text="Finalize Shoppinglist"`, `hasWeek()=true`. No code change needed.

2. **Add regression tests** to `src/test/suite/match-input-vocab.test.ts`:
   - `"task week Finalize Shoppinglist"` → Bug 1 regression
   - `"week"` → hasWeek=true, no crash
   - `"w15"` → week 15, no regression from `recognizeWeekNum` priority

## Test scenarios

| Scenario | Input | Expected |
|----------|-------|----------|
| Bug 1 regression — week+text | `"task week Finalize Shoppinglist"` | flag=task, text="Finalize Shoppinglist", hasWeek=true |
| Bug 1 regression — week alone | `"week"` | hasWeek=true, no crash |
| Bug 1 regression — w15 still numeric | `"w15"` | week=15 |
| No regression — task do | `"task do the shopping"` | flag=task, text="the shopping" (do = German Thursday) |

## Dependencies

- **Requires #177 tokenizer branch** — all changes land in `feat/177-smart-input-tokenizer`. This issue closes together with #177 in the same PR.

## Risk

| Risk | Mitigation |
|------|-----------|
| `recognizeWeek` lookahead differs from old regex fix | Regression tests cover all three inputs from issue report |

## Rollback

Part of #177 PR. Tests-only change — no rollback risk.

## Reference spec

[docs/specs/2026-06-01-fix-230-smart-input-week-and-weekday-aliases.md](../specs/2026-06-01-fix-230-smart-input-week-and-weekday-aliases.md)
