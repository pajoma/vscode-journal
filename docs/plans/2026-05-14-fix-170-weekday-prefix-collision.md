# Issue #170 — Implementation Plan: Weekday prefix collision fix

> **Spec:** [docs/specs/2026-05-14-fix-170-weekday-prefix-collision.md](../specs/2026-05-14-fix-170-weekday-prefix-collision.md)
> **Issue:** [pajoma/vscode-journal#170](https://github.com/pajoma/vscode-journal/issues/170)
> **Branch:** `170-wrong-day-is-set-when-enter-a-new-entry`
> **Created:** 2026-05-14

## Approach

Tighten the smart-input regex so each free-token group (`shortcut`, `offset`, `iso`, `weekday`, `weekNum`, `month + dayOfMonth`) must end on a word boundary. Implementation is a single-file change in `src/provider/features/match-input.ts`: wrap each token group in an outer optional group whose tail asserts `(?=\s|$)`. Existing `\s?` separators between groups stay (consume an inter-token space, do not anchor on a boundary).

Trade-off: the fix is a regex tweak, not a grammar redesign. It defends against the known bug class (substring matches against ambiguous locale prefixes) without restructuring `parseInput()`. A grammar-level refactor is tracked separately and out of scope per the spec.

Detection technique: TDD. Write the regression test first, watch it fail, fix the regex, watch it pass. Repeat per ambiguous-prefix locale.

## Steps

### Step 1 — Branch + baseline

- Working branch already exists: `170-wrong-day-is-set-when-enter-a-new-entry` (off `develop` HEAD `0744437`).
- Spec doc committed at `4b28aba`. Plan doc commit follows this file.
- Run `npm install` (post-`#176` merge — the toolchain bump from PR #176 is on `develop` so dep state is clean).
- Run `npm run check` and confirm the existing 39+ tests pass before any change.

### Step 2 — Write failing regression tests

File: `src/test/suite/input.test.ts` (extend existing suite — file is 142 lines, well within "focused" size).

Tests to add — each invokes `MatchInput.parseInput(<string>)` and asserts the resulting `Input` (a) offset / week / month state matches the expected interpretation and (b) `text` carries the right residual.

Negative tests (must currently fail; pass after fix):

1. `"Don Julio"` — expect `offset === 0`, `text === "Don Julio"`. (Issue body reproducer; German `do` prefix.)
2. `"Donnergrolln"` — expect `offset === 0`, `text === "Donnergrolln"`. (Longer German prefix substring; `donnerstag` partial.)
3. `"Tomato"` — expect `offset === 0`, `text === "Tomato"`. (English `tom` shortcut prefix collision.)
4. `"Maybelline"` — expect `offset === 0`, `text === "Maybelline"`, `month` undefined. (English `may` month prefix collision.)
5. `"Junior dev"` — expect `offset === 0`, `text === "Junior dev"`, `month` undefined. (English `jun` month prefix.)
6. `"Doel halen"` — expect `offset === 0`, `text === "Doel halen"`. (Dutch `do` prefix collision.)
7. `"Marathon"` — expect `offset === 0`, `text === "Marathon"`, `month` undefined. (Spanish `mar` weekday / English `mar` month collision.)

Positive controls (must already pass and continue to pass after fix):

8. `"do"` (lone) — expect weekday-resolved Thursday offset.
9. `"Donnerstag"` (German full) — expect weekday-resolved Thursday offset.
10. `"do task fix the regex"` — expect Thursday offset + `task` flag + `text === "fix the regex"`.
11. `"Mar 15"` — expect month=2 (March), dayOfMonth=15.
12. `"+3"` — expect `offset === 3`.
13. `"2024-03-18"` — expect date resolution.
14. `"w15"` / `"week 15"` — expect `week === 15`.

Run the suite. Tests 1–7 fail; tests 8–14 pass. Commit the failing tests:

```
git add src/test/suite/input.test.ts
git commit -m "test(input): add failing regression tests for issue #170 weekday prefix collision"
```

### Step 3 — Fix the regex

File: `src/provider/features/match-input.ts`.

Modification strategy: each free-token group is currently shaped like:

```
const shortcutPattern = '(?<shortcut>today|tod|yesterday|yes|tomorrow|tom|0)(?:\\s|$)';
```

The trailing `(?:\s|$)` is a *consuming* match — it eats a space. That's almost right, but combined with `\s?` separators downstream, it leaks. Replace with a *lookahead* that asserts boundary without consuming:

```
const shortcutPattern = '(?<shortcut>today|tod|yesterday|yes|tomorrow|tom|0)(?=\\s|$)';
```

Apply the same `(?:\s|$)` → `(?=\s|$)` substitution to:

- `offsetPattern` (line 385).
- `isoPattern` (line 386).
- `weekNumPattern` (line 391) — already ends `(?:\s|$)`, switch to lookahead.
- `dayOfMonthPattern` (line 394) — already ends `(?:\s|$)`, switch to lookahead.

For the patterns built via helpers (`getWeekdayPattern`, `getMonthPattern`), the wrapping group `(?<weekday>…)?` and `(?<month>…)+` does not currently have a trailing boundary at all — that's the issue #170 root cause. Move the boundary inside the optional wrap:

`getWeekdayPattern()` — change return value from:

```
return `(?<weekday>
    monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun
    | … locale alternatives …
)?`;
```

to:

```
return `(?:(?<weekday>
    monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun
    | … locale alternatives …
)(?=\\s|$))?`;
```

The named group keeps the same alternation. The `(?=\s|$)` lookahead is inside the outer `(?:…)?` so it only applies when the weekday actually matches; if the user types a non-weekday input, the outer group matches empty and the lookahead is never evaluated.

Apply the identical wrapper transformation to `getMonthPattern()`. (Note: `monthPattern` is currently used as `${monthPattern}${dayOfMonthPattern}`, i.e. month is followed by an optional space then `dayOfMonth`. The lookahead after month must accept the space that day-of-month consumes. `(?=\s|$)` does accept the space — it just doesn't consume it — so `dayOfMonthPattern`'s leading `\s?` still works.)

For `modifierPattern` (line 387):

```
const modifierPattern = '(?<modifier>next|last|n\\b|l\\b)?\\s?';
```

The `\b` anchors already handle single-letter modifier collisions. Leave this pattern unchanged — adding `(?=\s|$)` after the optional modifier would break the well-tested two-word path "next monday".

Reassemble `regExpPattern` (line 401) — no change to the assembly itself; the per-pattern changes propagate.

Run `npm run check`. Tests 1–7 (failing) should now pass. Tests 8–14 (positive controls) must remain green. Iterate if any control breaks.

Commit:

```
git add src/provider/features/match-input.ts
git commit -m "fix(input): require word boundary after weekday/month/shortcut/offset/iso tokens (#170)"
```

### Step 4 — Manual smoke

In the Extension Development Host (`F5`):

- Launch with no locale override. Type `Tomato` in the smart input. Expect: today's entry opens, text "Tomato" preserved.
- Restart with `--locale=de`. Type `Don Julio`. Expect: today's entry opens.
- Type `Donnerstag`. Expect: next Thursday's entry opens.
- Type `do`. Expect: next Thursday's entry opens (positive control).

Record the result (one line per check) in the PR description.

### Step 5 — Update PLAN.md and open PR

Reopen Phase 1.2 in `PLAN.md` and add a note pointing at issue #170 + this fix:

```diff
 ### 1.2 — Fix #170: Wrong Day Set on New Entry
-- [x] `MatchInput` stores `this.today = new Date()` at construction time; if the instance is reused across midnight, dates are wrong
-- [x] **Fix**: Added `refreshToday()` called at start of every `parseInput()`. Removed unused stale `Parser.today` field.
-- [x] Review `resolveISOString()`, `resolveWeekday()`, `resolveDayOfMonth()` for off-by-one errors — fixed month validation (`>12` → `>11`) and day validation (`<0` → `<1`)
-- [x] Add unit tests for edge cases (midnight boundary, timezone transitions)
+- [x] `MatchInput` stores `this.today = new Date()` at construction time; if the instance is reused across midnight, dates are wrong
+- [x] **Fix**: Added `refreshToday()` called at start of every `parseInput()`. Removed unused stale `Parser.today` field.
+- [x] Review `resolveISOString()`, `resolveWeekday()`, `resolveDayOfMonth()` for off-by-one errors — fixed month validation (`>12` → `>11`) and day validation (`<0` → `<1`)
+- [x] Add unit tests for edge cases (midnight boundary, timezone transitions)
+- [x] **Followup** (separate PR linked to issue #170): the *original* user-reported regression was a weekday-prefix collision in the input regex, not a stale-Date bug. Fixed in `src/provider/features/match-input.ts` by adding word-boundary lookaheads to the weekday/month/shortcut/offset/iso/weekNum token groups. Regression tests in `src/test/suite/input.test.ts`.
```

Commit:

```
git add PLAN.md
git commit -m "docs: record #170 weekday-prefix followup in PLAN.md Phase 1.2"
```

Push the branch (already tracking `origin/170-wrong-day-is-set-when-enter-a-new-entry`):

```
git push
```

Open the PR:

```
gh pr create --base develop \
  --title "Fix #170: word-boundary anchoring on smart-input weekday/month/shortcut tokens" \
  --body "<spec link + plan link + acceptance evidence>"
```

Post one line on the issue:

```
gh issue comment 170 --body "PR #<num> opens — implementing the approved plan."
```

## Test scenarios

| # | Scenario | Category | Maps to acceptance |
|---|---------|----------|--------------------|
| 1 | `Don Julio` doesn't shift to Thursday | unit (mocha) | Spec acceptance #1 |
| 2 | `Tomato` doesn't shift to Tomorrow | unit | Spec acceptance #1 |
| 3 | `Maybelline` doesn't claim May as month | unit | Spec acceptance #1 |
| 4 | `Junior dev` doesn't claim June as month | unit | Spec acceptance #1 |
| 5 | `Doel halen` (Dutch) doesn't shift to Thursday | unit | Spec acceptance #1 |
| 6 | `Marathon` doesn't shift to Tuesday or March | unit | Spec acceptance #1 |
| 7 | `Donnergrolln` doesn't shift to Thursday | unit | Spec acceptance #1 |
| 8 | `do` (lone) still resolves to Thursday | unit, positive control | Spec acceptance #4 |
| 9 | `Donnerstag` still resolves to Thursday | unit, positive control | Spec acceptance #3 |
| 10 | `do task fix the regex` keeps task flag + text | unit, positive control | regression for flag+weekday path |
| 11 | `Mar 15` resolves to March 15 | unit, positive control | month+day path stays intact |
| 12 | `+3` resolves to offset 3 | unit, positive control | offset path stays intact |
| 13 | `2024-03-18` resolves to ISO date | unit, positive control | iso path stays intact |
| 14 | `w15` / `week 15` resolves to week 15 | unit, positive control | week-num path stays intact |
| 15 | EDH smoke: typing `Don Julio` opens today's entry | manual | Spec acceptance #2 |
| 16 | EDH smoke (locale=de): typing `Donnerstag` opens next Thursday's entry | manual | Spec acceptance #3 |
| 17 | `npm run check` exits 0 with all tests + new ones green | automated, CI | Spec acceptance #1 |

## Dependencies

- None on other PRs. PR #176 (engine + l10n migration) merged into `develop` at `0744437` — this branch is cut from that base.
- No coordinated work in other repos.

## Risk

- **R1 — Regex change breaks a path not covered by existing tests.** Mitigation: positive-control tests 8–14 cover every named-group code path. Manual EDH smoke covers the integration with QuickPick.
- **R2 — Lookahead interaction with the optional outer `?` produces an unexpected match.** Mitigation: placing the lookahead INSIDE the outer `(?:…)?` group ensures the boundary only applies when the token actually matched. Test 8 (`do` alone, lone two-letter prefix) is the canary; if it breaks, the wrapping is wrong.
- **R3 — Some locales' weekday alternation has different boundary semantics (CJK languages where space-segmentation is less common).** Mitigation: `(?=\s|$)` already handles end-of-string, which is the dominant case for CJK input (the user just types the weekday and hits Enter). Add a positive-control test for `xīngqī sì` (Chinese Thursday) if time permits — confirms latin-transliterated CJK weekdays still match.
- **R4 — Plan misses an additional ambiguous prefix in a locale we don't have test coverage for.** Mitigation: the structural fix (word-boundary lookahead) applies uniformly. Even if a specific case isn't tested, the same defense holds. Add coverage in a followup if a user reports it.

## Rollback

The diff is contained to `src/provider/features/match-input.ts` (one file) plus tests. If a regression surfaces post-merge:

1. `git revert <fix-commit>` (Step 3 commit). Tests stay (Step 2 commit) as documentation of the open bug.
2. Re-open issue #170 with the new failure mode attached.
3. The reverted code is the same shape as before PR #176 — no compatibility shim needed.

## Reference

- Spec: [`docs/specs/2026-05-14-fix-170-weekday-prefix-collision.md`](../specs/2026-05-14-fix-170-weekday-prefix-collision.md)
- Issue: [pajoma/vscode-journal#170](https://github.com/pajoma/vscode-journal/issues/170)
- Root cause site: `src/provider/features/match-input.ts:401` (regex assembly), `:426` (`getWeekdayPattern`), `:411` (`getMonthPattern`), `:383–394` (inline patterns).
