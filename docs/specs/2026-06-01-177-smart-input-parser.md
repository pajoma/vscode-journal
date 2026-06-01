# Issue #177 — Replace smart-input regex with a proper parser

> **Issue:** [pajoma/vscode-journal#177](https://github.com/pajoma/vscode-journal/issues/177)
> **Created:** 2026-06-01

## Goal

Replace the single assembled regex in `src/journal/match-input.ts` (`getExpression()`) with a structured tokenizer + locale-vocab-table approach that eliminates alternation-order fragility, enables exhaustive testing, and makes locale extension declarative.

## Why now

Issue #170 patched the immediate prefix-collision bug with `(?=\s|$)` lookaheads inside the regex. That fix closes the symptom for known cases but does not remove the structural root cause: alternation order in a single opaque regex is invisible, brittle, and impossible to cover exhaustively. Every new locale, shortcut, or syntax form (#230 adds week-boundary shortcuts and 2-letter aliases) requires re-deriving the whole regex's behaviour by hand. The 1.2.0 roadmap treats this as the strategic prerequisite for any further smart-input work.

## Current structure (what we are replacing)

`src/journal/match-input.ts` — 502 lines, one class:

- `getExpression()` — assembles a single named-group regex from component string fragments. Cached in `this.expr`.
- `getWeekdayPattern()` — builds a locale-keyed alternation string (`monday|...|montag|...|lun(?:di)?|...`) joined from arrays. Already structured as arrays; currently joined into a regex alternation.
- `getMonthPattern()` — same shape for month names across 10 locales.
- `parseInput()` — runs the regex, then post-processes named capture groups into an `Input` object. Most branching lives here (~200 lines of `if/switch`).

The `Input` model (`src/model/`) is **unchanged** by this issue — it is the stable public contract.

## Option analysis

### Option A — Hand-written tokenizer (sequential recognizers)

Replace `getExpression()` with a `Tokenizer` that walks the input string left-to-right, trying each recognizer in priority order. Each recognizer claims a prefix, returns a typed `Token`, and advances the cursor. `parseInput()` then maps the token stream to an `Input`.

**Bundle size:** zero added deps. Comparable code size to current 502-line file.  
**Readability:** each recognizer is a small, named function — individually readable and unit-testable.  
**Locale extensibility:** locale vocab stays in the existing arrays; recognizers reference those arrays directly. Adding a locale = add to the vocab array only.  
**Test coverage:** each recognizer can be unit-tested in isolation (pure functions, no regex). Property-based tests (e.g. fuzz over all weekday abbreviations) are straightforward.  
**Breaking-change risk:** zero — `Input` model unchanged; `parseInput()` signature unchanged.  
**Trade-off:** initial rewrite effort; must replicate all edge cases (ISO date formats, week-number variants, offset `+N`/`-N`, `task`/`todo` flags pre/post). Requires a careful migration phase to run old and new in parallel until parity is confirmed.

### Option B — Parser combinator (arcsecond or tiny in-tree)

A parser-combinator library lets you write grammar rules as composable functions (`seq`, `alt`, `many`, `map`). Either pull in `arcsecond` (~15 kB minified) or write a 100-line in-tree micro-combinator.

**Bundle size:** `arcsecond` is not tree-shaken by esbuild in all cases; ~8 kB net after shake. In-tree combinator adds ~100 lines.  
**Readability:** grammar is declarative and compositional. Very readable once familiar with the idiom.  
**Locale extensibility:** same as Option A — vocab tables drive the leaf parsers.  
**Test coverage:** combinators are composable and individually testable.  
**Breaking-change risk:** zero for `Input` model; low for bundle if in-tree.  
**Trade-off:** external dep (or non-trivial in-tree code) for a domain that is simpler than what combinators are designed for. Combinator error messages are harder to surface in VS Code toasts.

### Option C — Lookup-driven dispatch (vocab tables + priority scan)

`getWeekdayPattern()` and `getMonthPattern()` already produce sorted arrays per locale. Option C keeps those tables, stops joining them into regex strings, and drives a scan-loop that tries each vocab entry as a `startsWith` (case-insensitive, word-boundary checked). The overall parse sequence mirrors Option A but the recognizers are data-driven rather than function-based.

**Bundle size:** zero deps.  
**Readability:** vocab tables are easy to read; scan logic is ~30 lines.  
**Locale extensibility:** best of the three — locale data is entirely declarative.  
**Test coverage:** scan loop is a pure function over a vocab table, trivially testable.  
**Breaking-change risk:** zero.  
**Trade-off:** less composable than combinator; the scan loop must enforce priority order explicitly (longest-match-first), which requires sorting vocab entries by descending length before scanning.

## Recommendation

**Option A (tokenizer) with Option C's vocab-table data layer.**

Concretely:
1. Keep `getWeekdayPattern()` and `getMonthPattern()` as array-returning functions (remove the final `.join('|')` and regex wrapping). Name them `WEEKDAY_VOCAB` and `MONTH_VOCAB`.
2. Implement a `Tokenizer` class (or module-level function set) with one recognizer per token type: `recognizeFlag`, `recognizeShortcut`, `recognizeOffset`, `recognizeISO`, `recognizeWeekNum`, `recognizeWeekBoundary`, `recognizeWeekday`, `recognizeMonth`, `recognizeText`.
3. Each recognizer is a pure function `(input: string, pos: number, locale: string) => Token | null`. Longest-match-first for locale vocab; word-boundary enforced via a helper (replicates the `(?=\s|$)` fix from #170).
4. `parseInput()` calls `tokenize(input, locale)` → `Token[]`, then maps to `Input` (the existing post-processing logic survives largely intact, just reading token types instead of named groups).
5. The old regex path is deleted once the new tokenizer passes all existing tests plus the #170 regression suite.
6. The four `moment` calls in `match-input.ts` are replaced inline during the rewrite — no moment import remains in the file after cutover:
   - `moment().week()` → `getISOWeekNumber(new Date())` (existing helper in `dates.ts`)
   - `moment()` → `new Date()`
   - `moment().month(m).date(d)` → `new Date(year, m, d)`

This approach has zero external dependencies, keeps locale data declarative, makes every token type independently unit-testable, and mirrors the existing code structure closely enough to minimize migration risk.

## Visual feedback via QuickPick validation severity

The tokenizer produces a typed `Token[]` stream, which makes parse confidence explicit for the first time. Use that to drive `validationMessage` on the existing `QuickPick` in `Dialogues` (`src/vscode/dialogues.ts`):

| Tokenizer result | `validationMessage.severity` | Border color | Condition |
|-----------------|------------------------------|--------------|-----------|
| All tokens resolved, date unambiguous | `QuickInputSeverity.Info` | Blue | Happy path — recognized date/offset/weekday |
| Partial match or ambiguous prefix | `QuickInputSeverity.Warning` | Yellow | e.g. `mar` could be March or martes or mars |
| No structured token, free text only | none (clear message) | Default | User is typing a memo/note title, not a date |

```ts
// in the onDidChangeValue handler, after parseInput() resolves:
input.validationMessage = confidence === 'resolved'
    ? { message: descriptionText, severity: QuickInputSeverity.Info }
    : confidence === 'ambiguous'
    ? { message: descriptionText, severity: QuickInputSeverity.Warning }
    : undefined;
```

`QuickInputSeverity` is the correct enum for `QuickPick` (not `InputBoxValidationSeverity`). Available since VS Code 1.70; well below the extension's 1.118 minimum.

The tokenizer must expose a `confidence` field (or equivalent) on its result: `'resolved' | 'ambiguous' | 'text-only'`. This is the only new public surface added by the visual-feedback slice.

## Acceptance criteria

### Design phase (this spec)

- Trade-off analysis covering all three options with bundle size, readability, locale extensibility, test coverage, and breaking-change risk — **done above**.
- Recommendation with rationale — **done above**.
- Migration plan that preserves the published 1.x `Input` contract — see section below.
- Success metrics defined — see section below.

### Implementation phase (to be detailed in the plan)

- All 34 existing test cases in `input.test.ts` and `week-input.test.ts` pass with the new tokenizer.
- The #170 regression cases (German `do`/`di`/`fr`, Dutch `do`/`vr`, Spanish `mar`/`vie` prefix collisions) pass.
- A new property-based test suite (`src/test/suite/match-input-vocab.test.ts`) sweeps all weekday and month abbreviations across all supported locales and asserts no false-positive match against a corpus of common everyday words that share prefixes.
- `npm run check` (lint + compile + full test) green on CI.
- No change to the exported `Input` type or the `parseInput(inputString: string): Promise<Input>` signature.
- No `import moment` remains in `match-input.ts` after cutover.
- `QuickPick` shows blue border (`QuickInputSeverity.Info`) on unambiguous parse, yellow border (`QuickInputSeverity.Warning`) on ambiguous parse, no border on free-text-only input.

## Migration plan

1. **Parallel phase:** Add `tokenize()` alongside the existing `getExpression()`. Run both paths in `parseInput()`; log a warning when outputs differ. Use this to surface edge cases in the test workspace before removing the regex.
2. **Parity phase:** Add test cases for every discovered divergence until both paths agree. Extend the property-based test suite.
3. **Cutover:** Remove `getExpression()`, the `this.expr` cache, and the parallel-run scaffolding. `parseInput()` uses tokenizer only.

No feature-flag needed — the parallel phase is purely internal to `parseInput()`, invisible to callers.

## Success metrics

| Metric | Target |
|--------|--------|
| Existing `input.test.ts` cases | All 30 pass |
| Existing `week-input.test.ts` cases | All 4 pass |
| #170 prefix-collision regression cases | All pass |
| New vocab property-based sweep | Zero false-positive weekday/month matches |
| `npm run check` | Green |
| Bundle size delta | < +2 kB minified (zero external deps) |
| Visual feedback — blue border on resolved parse | Pass |
| Visual feedback — yellow border on ambiguous parse | Pass |
| Visual feedback — no border on free-text input | Pass |

## Constraints

- No change to `Input` model or `parseInput()` public signature.
- No new external runtime dependencies (only devDependencies for test tooling if needed).
- Must work in both local and Remote SSH/Codespaces extension hosts (pure TS logic, no Node built-ins beyond what already exists).
- Target: `src/journal/match-input.ts` remains the single home for parsing logic.

## Out of scope

- Structural changes to QuickPick/InputBox layout, item format, or command wiring (color severity feedback via `validationMessage` IS in scope — see above).
- Localization of UI strings (handled by `vscode.l10n`, issue #176).
- Moment.js removal **outside `match-input.ts`** — `dates.ts`, `template-engine.ts`, `navigation.ts`, `paths.ts`, and other files remain on moment (PLAN.md Phase 3).
- Adding new syntax forms (tracked separately in #230 — but the new tokenizer must be extensible enough to absorb those changes without structural surgery).

## Related

- **Blocked by:** none (PR for #170 already merged or in flight; this issue follows).
- **Related:** #170 (prefix-collision fix that motivated this), #167 (regex/data drift bug family), #230 (week-boundary + 2-letter alias — new syntax that will land on the new tokenizer).
- **PLAN.md:** no current phase explicitly tracks this; 1.2.0 milestone.
