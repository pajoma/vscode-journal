# Plan: Consolidate Template and Date Replacement Logic — #211

## Reference spec
[docs/specs/2026-05-18-211-template-engine-dry.md](../specs/2026-05-18-211-template-engine-dry.md)

## Approved decisions
- Module: `src/journal/template-engine.ts` (journal domain layer, not util)
- `${week}` gap: fix in scope — add to `toMomentFormat` as well
- Thread-safe locales: `moment(date).locale(loc)` — no global `moment.locale()` calls
- Single-pass: `template.replace(regex, callback)` — no forEach + multiple replaces
- Registry pattern: each entry holds both `resolve` fn and `momentFormat` string

## Approach
Replace two parallel switch/case blocks with a single `TEMPLATE_VARIABLE_MAP` registry. Both `resolveDate` and `toMomentFormat` use one regex callback pass over the registry. Structural impossibility of drift: adding a variable requires one map entry with both fields.

Trade-off: moving functions from `util/` to `journal/` means callers in `vscode/` and `features/` import cross-layer. Acceptable because `util/` was a generic dumping ground; the domain layer is the right home. The barrel (`src/journal/index.ts`) re-exports the new functions, keeping import paths short.

## Steps

### 1 — Create `src/journal/template-engine.ts`
New file. Contains:
- `TEMPLATE_VARIABLE_MAP` (module-private) — 7 named entries each with `momentFormat` and `resolve(m: Moment): string`
- `TEMPLATE_VAR_REGEX` (module-private) — same pattern as current `regExpDateFormats` in `dates.ts`
- `resolveDate(template, date, locale?)` — single-pass regex replace using `moment(date).locale(locale)`, not global locale
- `toMomentFormat(template)` — single-pass regex replace returning moment format tokens; `${d:fmt}` → `fmt` passthrough; `${week}` → `'w'` (fixing the existing gap)

Why first: all subsequent steps depend on this file existing.

### 2 — Update `src/util/dates.ts`
Remove:
- `regExpDateFormats` constant
- `replaceDateFormats` function
- `replaceDateTemplatesWithMomentsFormats` function

Keep all other functions (`formatDate`, `getCurrentISOWeek`, `getISOWeekYear`, `getDatesOfISOWeek`, `getDayOfWeekForString`, `getMonthForString`).

Why: eliminates the source of duplication. Must happen after step 1.

### 3 — Update `src/util/index.ts`
Remove `replaceDateFormats` and `replaceDateTemplatesWithMomentsFormats` from the `export { ... } from './dates'` block.

Why: barrel must not re-export deleted symbols.

### 4 — Update `src/journal/index.ts`
Add exports:
```typescript
export { resolveDate, toMomentFormat } from './template-engine';
```
Why: makes the new API reachable as `J.Journal.resolveDate` and via named imports from `'../journal'` for vscode/features layers.

### 5 — Update `src/journal/paths.ts`
Line 26: change `import { replaceDateTemplatesWithMomentsFormats } from '../util/dates'` to `import { toMomentFormat } from './template-engine'`.

Lines 78–79: replace `replaceDateTemplatesWithMomentsFormats(...)` → `toMomentFormat(...)`.

Why: closest caller; direct sibling import.

### 6 — Update `src/vscode/conf.ts`
Line 26: change `import { replaceDateFormats, replaceVariableValue } from '../util'` — remove `replaceDateFormats`, add `import { resolveDate } from '../journal/template-engine'`.

Lines 342, 368: replace `replaceDateFormats(...)` → `resolveDate(...)`.

Why: conf.ts is in the vscode layer; import from journal domain is fine.

### 7 — Update `src/features/sync/sync-daily-links.ts`
Line 4: change `import { getDatesOfISOWeek, replaceDateFormats, replaceVariableValue } from '../../util'` — remove `replaceDateFormats`, add `import { resolveDate } from '../../journal/template-engine'`.

Line 80: replace `replaceDateFormats(...)` → `resolveDate(...)`.

Why: same locale-aware signature; drop-in replacement.

### 8 — Fix `src/test/direct/path-parse-with-date.ts`
Remove local duplicate `replaceDateTemplatesWithMomentsFormats` function (lines 124+).
Replace its two call sites (lines 94–95) with `toMomentFormat` imported from `../../journal/template-engine`.

Why: this is the third copy of the function — the most egregious duplication site.

### 9 — Fix `src/test/direct/replace-variables-in-string.ts`
Update import: `import { replaceDateFormats } from "../../util/dates"` → `import { resolveDate } from "../../journal/template-engine"`.
Update call sites: `replaceDateFormats(...)` → `resolveDate(...)`.

Why: test file must import from the new location; function signature is identical.

## Test scenarios

**Unit (new file `src/test/suite/template-engine.test.ts`):**
- `resolveDate-named-vars`: `${year}`, `${month}`, `${day}`, `${localTime}`, `${localDate}`, `${weekday}`, `${week}` each replaced with correct formatted value for a known date
- `resolveDate-custom-format`: `${d:YY}` → two-digit year; `${d:dddd}` → weekday name
- `resolveDate-no-vars`: template without `${...}` returns unchanged
- `resolveDate-locale-isolation`: calling `resolveDate` twice with different locales returns locale-specific results without affecting a subsequent call (proves no global locale mutation)
- `toMomentFormat-named-vars`: all 7 variables replaced with correct moment tokens, including `${week}` → `'w'`
- `toMomentFormat-custom-format`: `${d:YY}` → `'YY'` (passthrough)
- `toMomentFormat-week-fixed`: `${week}` → `'w'` (explicit test for the closed gap)

**Integration (existing tests, unchanged assertions):**
- `replace-variables-in-string.ts` — same outputs as before (behavior parity)
- `path-parse-with-date.ts` — path construction still produces same paths after removing local duplicate

## Dependencies
- feat-210 (#210) must land on `develop` before this PR is merged (avoid double-churn on `src/model/`). Implementation can proceed on a feature branch in parallel; merge order matters.

## Risk
- **Locale regression:** old code mutated global `moment.locale(locale)` before formatting. New code uses `moment(date).locale(loc)`. Behavior is equivalent for sequential calls but safe for concurrent calls. The `resolveDate-locale-isolation` test scenario covers this.
- **`${week}` toMomentFormat gap fixed:** `toMomentFormat` previously silently dropped `${week}`. After this PR it maps to `'w'`. Any caller that depended on the silent-drop behavior (passing output to `moment.format`) would change. Audit: only caller is `src/journal/paths.ts` lines 78–79. Those paths do not use `${week}`, so no behavior change in practice.

## Rollback
Revert the feature branch. No schema migrations, no config changes, no data touched.

## Implementation branch
`feat/211-template-engine-dry` off `develop` (or off the feat-210 branch if sequencing is needed).
