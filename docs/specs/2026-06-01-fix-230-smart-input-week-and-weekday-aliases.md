# Spec: Smart Input — week-text boundary and 2-letter English weekday aliases (#230)

## Goal

Fix two parsing defects in `MatchInput`: (1) the week-token regex consumes the first character of the following text, and (2) 2-letter English weekday abbreviations (`mo`, `tu`, `we`, `th`, `fr`) are not recognized.

## Why now

Both defects break user-visible output in the current 1.1.0 milestone.  The week-text bug silently corrupts task and memo content; the missing aliases were discovered in the same report.

## In scope

- Fix `weekPattern` in `MatchInput.getExpression()` so it does not consume any character beyond the week token itself.
- Add `mo`, `tu`, `fr` to `getWeekdayPattern()` as recognized English aliases (longest-first ordering; after the 3-letter set). `we` and `th` are excluded — both are high-frequency English words that would destructively consume text (e.g. `"task we need to buy milk"` → `we` parsed as Wednesday).
- Add regression tests in `src/test/suite/input.test.ts` and/or `week-input.test.ts` covering the exact inputs from the issue report.

## Out of scope

- German 2-letter abbreviation conflicts (`di`, `do`, `fr`, `sa`, `so`) — tracked in #177 (parser rewrite).
- Locale-based weekday filtering — also #177.
- Any change to `getDayOfWeekForString` in `dates.ts` (already maps `mo/tu/we/th/fr` correctly).

## Acceptance criteria

1. `parseInput("task week Finalize Shoppinglist")` → `flags="task"`, `text="Finalize Shoppinglist"`, `week` = current week number.
2. `parseInput("task do the shopping")` — behaviour unchanged (deferred; `do` still fires as German Thursday, text = "the shopping"). No regression.
3. `parseInput("mo")` → `weekday` group matched, `offset` resolves to next/prev Monday relative to today (same as `parseInput("mon")`).
4. Same for `tu`, `fr`. `we` and `th` are NOT added — they collide with common English words.
5. `parseInput("w15")` → `week=15` (no regression from week-pattern change).
6. `parseInput("week")` alone (no following text) → `hasWeek()` true, no crash.
7. Full test suite green.

## Root causes

### Bug 1 — week pattern consumes first character of text

Current:
```
const weekPattern = '(?<week>w(?:eek)?(?:\\s\\D|$))';
```
`(?:\\s\\D|$)` alternates between (whitespace + one non-digit character consumed) and end-of-string.  For input `"week Finalize…"` the `\\D` captures `"F"`, leaving `"inalize…"` in the text group.

Fix: replace the consuming `\\D` with a lookahead so the non-digit character stays available for the trailing `\\s?` and `textPattern`:
```
const weekPattern = '(?<week>w(?:eek)?)(?=\\s(?!\\d)|$)';
```
`(?=\\s(?!\\d)|$)` asserts (without consuming) that the week token is followed by whitespace-then-non-digit or end-of-string, which prevents `"week15"` from matching this branch (it falls through to `weekNumPattern`).

### Bug 2 — 2-letter English aliases absent from weekday pattern

`getDayOfWeekForString` (dates.ts:86-90) already maps `mo → 1`, `tu → 2`, `we → 3`, `th → 4`, `fr → 5`.  `getWeekdayPattern()` only lists 3-letter English forms (`mon`, `tue`, `wed`, `thu`, `fri`), so the 2-letter variants never reach `resolveWeekday`.

Fix: append `'mo', 'tu', 'fr'` after the 3-letter English group in the `alternatives` array (longest-first ordering preserved). `we` and `th` are excluded — `we` is a common English pronoun and would destructively consume words like "we" in `"task we need to buy milk"`; `th` appears at the start of many English words.

## Entities / interfaces

- `MatchInput.getExpression()` — `weekPattern` constant (one line change).
- `MatchInput.getWeekdayPattern()` — `alternatives` array (one section addition).
- No interface or model changes.

## Constraints

- Tests run inside a VS Code Extension Host; pure-regex / pure-parse logic can also be exercised via `node -e` without VS Code.
- `this.expr` is built once and cached; changing the pattern constants only affects new `MatchInput` instances (no state migration needed).
- Must not regress existing tests, including the `lone 'do'` and `'Donnerstag'` tests in `input.test.ts`.

## Open questions

None after clarification.

## Related issues

- Blocks: none.
- Related: #177 (parser rewrite — will supersede the German 2-letter abbreviation side of this report).
