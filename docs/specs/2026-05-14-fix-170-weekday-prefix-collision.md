# Issue #170 — Wrong day set when entering a new entry (weekday prefix collision)

> **Issue:** [pajoma/vscode-journal#170](https://github.com/pajoma/vscode-journal/issues/170)
> **Branch:** `170-wrong-day-is-set-when-enter-a-new-entry`
> **Created:** 2026-05-14

## Goal

When a user types free-text input into the journal smart-input (`Ctrl+Shift+J`) that happens to start with characters matching a localized weekday prefix (e.g. `Don Julio`), the input parser must not interpret those characters as a weekday and shift the journal date. The fix must hold across every locale currently supported by the weekday alternation in `getWeekdayPattern()`.

## Why now

User-reported regression in 1.1.0 milestone (issue dates from March 2024, reopened by the PR #176 spec review when PLAN.md Phase 1.2 was marked done without addressing the actual root cause). The bug is reproducible on any locale whose weekday alternation includes two- or three-letter prefixes that collide with everyday vocabulary — German (`do`, `di`, `fr`, `sa`, `so`), Dutch (`do`, `vr`, `za`, `zo`), Italian (`do`), Spanish (`mar`, `vie`). Anyone typing a free-text entry whose first word starts with one of those substrings gets the wrong date.

The owner's comment on the issue ("It should switch back once you enter `Don`") confirms the *intent* is that bare weekday prefixes only match when they are a standalone token. The current regex does not enforce that.

## Root cause

`src/provider/features/match-input.ts:426–441` — `getWeekdayPattern()` returns:

```
(?<weekday>
    monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun
    |montag|mon|dienstag|di|mittwoch|mit|donnerstag|do|freitag|fr|samstag|sa|sonntag|so
    |…
)?
```

The wrapping regex (built in `parseInput()` around line 401) places the group inside:

```
(?:${modifierPattern}(?:${weekdayPattern}|${weekPattern})?\s?|…)?
```

so the weekday group is followed only by an optional whitespace, not by a word boundary. With the regex's `i` flag, an input like `Don Julio` matches:
- `modifier` empty
- `weekday` captures `Do` (the German "Donnerstag" prefix listed as the bare alternation `do`)
- `\s?` consumes nothing (no space yet)
- `text` captures `n Julio`

`resolveWeekday("Do", …)` then returns `+2` (Thursday offset on a Tuesday) and the entry date is shifted.

The same shape applies to other ambiguous prefixes — and likely to `shortcut` (`tod`, `tom`, `yes`, `mor`), `month` (`mar`, `may`, `jun`), and the `iso` group, which are similarly anchored only by optional whitespace.

## Scope

### In scope

1. **Word-boundary lookahead on the weekday group.** Add `(?=\s|$)` (or equivalent) immediately after `(?<weekday>…)?` so a weekday match must be followed by whitespace or end-of-string. `Don Julio` will no longer match `do`; `do` typed alone or `do task something` will still match.
2. **Same word-boundary discipline applied to the other free-token groups** of the smart-input regex: `shortcut`, `offset`, `iso`, `weekday`, `month` + `dayOfMonth`, `weekNum`. Each must require a trailing word boundary so input like `Tomato` doesn't match `tom`, `Maybelline` doesn't match `may`, `Junior` doesn't match `jun`, etc.
3. **Regression tests** in `src/test/suite/input.test.ts` (or a new `weekday-collision.test.ts`) covering:
   - `Don Julio` → date offset 0, text = `Don Julio` (German Donnerstag prefix collision).
   - `Tomato` → date offset 0, text = `Tomato` (English Tuesday/Tomorrow prefix collision).
   - `Maybelline` → date offset 0, text = `Maybelline` (English May month-name collision).
   - `Junior` → date offset 0, text = `Junior` (English June collision).
   - `Donderdag taak` (Dutch full weekday + task) → still resolves to Thursday with `text = taak`. (Confirms full-token matches keep working.)
   - `do` alone → resolves to Thursday (confirms bare two-letter weekday still works).
   - `mar` in Spanish locale → resolves to Tuesday (Spanish "martes"), but `marathon` does NOT.

### Out of scope

- Generalizing the input grammar into a parser combinator or moving away from regex (worth doing, but a deeper refactor — track separately).
- Cleaning up the weekday alternation's per-locale ordering (longest-first), which would be a secondary defense-in-depth but is not necessary if the word-boundary fix lands.
- Touching `getDayOfWeekForString` in `src/util/dates.ts` — that function is called with an already-extracted token; the bug is in token extraction, not in classification.
- Any moment.js work (PLAN.md Phase 3 owns it).

## Acceptance criteria

The PR for issue #170 must satisfy all of the following:

1. `npm run check` passes — lint clean, esbuild compiles, all existing tests pass (39+), and every new regression test from "In scope #3" above passes on first run.
2. Manually entering `Don Julio` (and similar inputs from the regression test list) in the smart-input opens an entry for **today**, not Thursday — verified in the Extension Development Host with `--locale=de`.
3. Manually entering `Donnerstag` (full word) still opens an entry for the next Thursday — verified in EDH.
4. Manually entering `do` (lone two-letter prefix) still opens an entry for Thursday — verified in EDH.
5. The regex change is contained to `src/provider/features/match-input.ts`. No source changes elsewhere unless the regression tests reveal a deeper bug.

## Entities / contracts touched

- `src/provider/features/match-input.ts`
  - `getWeekdayPattern()` — return value gets a trailing `(?=\s|$)` lookahead.
  - The shortcut, offset, iso, week-number, and month/day patterns inlined in `parseInput()` around line 353 / 401 — each gets the same lookahead. Some already have `(?:\s|$)` consumption; verify and unify rather than duplicate.
  - The overall `expr` regex string assembled in `parseInput()` may need adjustment so the trailing lookahead composes correctly with the existing `\s?` between groups.
- `src/test/suite/input.test.ts` (existing TDD test file for `MatchInput`) — new test cases. If the file would grow unwieldy, split into `weekday-collision.test.ts`.

## Constraints

- The fix must work under the existing regex compilation in `parseInput()` (line 404, `new RegExp(regExpPattern, 'i')`) — no flag changes (`s`, `u`, `g`, `y` could alter other behavior).
- Cannot rely on JavaScript regex named-group resets or alternation ordering for correctness — must be a structural boundary, not a positional one.
- Locale strings already use Unicode characters (Russian, Arabic, Chinese, Japanese). The boundary lookahead `(?=\s|$)` works on any code point, so no Unicode-flag change is needed.

## Open questions

None at time of writing. The decision tree is locked:
1. Fix approach: word-boundary lookahead (`(?=\s|$)`).
2. Scope: audit all free-token groups in the input regex (shortcut, offset, iso, weekday, week-num, month + dayOfMonth).
3. Tests: comprehensive regression coverage spanning the ambiguous-prefix surface.

## Related issues

- PLAN.md Phase 1.2 — was marked done after PR #176 but the listed bullets address the stale `today` Date instance, not this prefix-collision regression. The plan item will be re-opened in the implementation PR.
- Indirectly related: PLAN.md Phase 6 future-work items (smarter input grammar) — orthogonal.

## Reference

- Issue body: typing `Don Julio` shifts to Thursday (2024-03-18 reported).
- Owner reply: confirms `Do` matches German Donnerstag prefix; expected behavior is that the match disappears once additional non-weekday characters follow.
- Match site: `src/provider/features/match-input.ts:426` (`getWeekdayPattern`), `src/provider/features/match-input.ts:401` (regex assembly).
