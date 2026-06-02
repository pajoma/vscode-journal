# Spec: Smart Input — week-text boundary fix (#230)

## Goal

Fix one parsing defect in `MatchInput`: the week-token regex consumes the first character of the following text. 2-letter English weekday aliases are out of scope — 3-letter forms (`mon`, `tue`, `wed`, `thu`, `fri`) are the supported standard.

## Why now

Defect breaks user-visible output in the current 1.1.0 milestone. The week-text bug silently corrupts task and memo content (e.g. `"task week Finalize Shoppinglist"` → text becomes `"inalize Shoppinglist"`).

## In scope

- Fix `weekPattern` in `MatchInput.getExpression()` so it does not consume any character beyond the week token itself.
- Add regression tests covering the exact inputs from the issue report.

## Out of scope

- 2-letter English weekday aliases (`mo`, `tu`, `we`, `th`, `fr`) — 3-letter forms (`mon/tue/wed/thu/fri`) are the supported standard. Adding shorter forms introduces unacceptable collision risk with common English words (`we`, `th`).
- German 2-letter abbreviation conflicts (`di`, `do`, `fr`, `sa`, `so`) — tracked in #177 (parser rewrite).
- Locale-based weekday filtering — also #177.
- Any change to `getDayOfWeekForString` in `dates.ts`.

## Acceptance criteria

1. `parseInput("task week Finalize Shoppinglist")` → `flags="task"`, `text="Finalize Shoppinglist"`, `week` = current week number.
2. `parseInput("task do the shopping")` — behaviour unchanged (`do` still fires as German Thursday, text = "the shopping"). No regression.
3. `parseInput("w15")` → `week=15` (no regression from week-pattern change).
4. `parseInput("week")` alone (no following text) → `hasWeek()` true, no crash.
5. Full test suite green.

## Root cause

### Bug 1 — week pattern consumes first character of text

Current:
```
const weekPattern = '(?<week>w(?:eek)?(?:\\s\\D|$))';
```
`(?:\\s\\D|$)` alternates between (whitespace + one non-digit character consumed) and end-of-string. For input `"week Finalize…"` the `\\D` captures `"F"`, leaving `"inalize…"` in the text group.

Fix: replace the consuming `\\D` with a lookahead so the non-digit character stays available for the trailing `\\s?` and `textPattern`:
```
const weekPattern = '(?<week>w(?:eek)?)(?=\\s(?!\\d)|$)';
```
`(?=\\s(?!\\d)|$)` asserts (without consuming) that the week token is followed by whitespace-then-non-digit or end-of-string, which prevents `"week15"` from matching this branch (it falls through to `weekNumPattern`).

## Entities / interfaces

- `MatchInput.getExpression()` — `weekPattern` constant (one line change).
- No interface or model changes.

## Constraints

- Tests run inside a VS Code Extension Host; pure-regex / pure-parse logic can also be exercised via `node -e` without VS Code.
- `this.expr` is built once and cached; changing the pattern constants only affects new `MatchInput` instances (no state migration needed).
- Must not regress existing tests, including the `lone 'do'` and `'Donnerstag'` tests in `input.test.ts`.

## Open questions

None.

## Related issues

- Blocks: none.
- Related: #177 (parser rewrite — tokenizer's `recognizeWeek` uses zero-width lookahead by design, so Bug 1 is also fixed there).
