# Plan — Issue #177: Replace smart-input regex with a proper parser

> **Spec:** [docs/specs/2026-06-01-177-smart-input-parser.md](../specs/2026-06-01-177-smart-input-parser.md)
> **Issue:** [pajoma/vscode-journal#177](https://github.com/pajoma/vscode-journal/issues/177)
> **Branch:** `feat/177-smart-input-tokenizer`
> **Created:** 2026-06-01

## Approach

Implement a left-to-right tokenizer inside `src/journal/match-input.ts` that replaces `getExpression()` and its regex-based dispatch. Recognizers are pure functions, one per token type, operating on vocab arrays instead of joined regex alternations. A `confidence` field on the result drives `QuickPick` border-colour feedback in `Dialogues`. Moment calls in the file are replaced inline. Old regex path runs in parallel until all tests pass, then is deleted.

**Main trade-off:** Parallel phase adds temporary complexity (two code paths, divergence logging). Benefit: zero big-bang risk — any edge case surfaced in the test workspace triggers a targeted fix before cutover.

## Steps

### Step 1 — Define token types and interfaces in `match-input.ts`

Add before the `MatchInput` class:

```ts
type TokenType =
    | 'flag' | 'shortcut' | 'offset' | 'iso'
    | 'weekNum' | 'week' | 'modifier' | 'weekday'
    | 'month' | 'dayOfMonth' | 'text';

interface Token { type: TokenType; value: string; raw: string; }

type ParseConfidence = 'resolved' | 'ambiguous' | 'text-only';

interface TokenizeResult { tokens: Token[]; confidence: ParseConfidence; }
```

Add optional `confidence?: ParseConfidence` to `src/model/input.ts` (the `Input` class). Callers that don't read it are unaffected.

**Why:** Typed tokens are the contract between tokenizer and mapper. `confidence` on `Input` threads the signal to `Dialogues` without changing `parseInput()`'s signature.

---

### Step 2 — Refactor vocab tables to return arrays

Change `getWeekdayPattern()` and `getMonthPattern()` to return `string[]` instead of a regex string. Rename to `weekdayVocab(): string[]` and `monthVocab(): string[]`. Remove the `.join('|')` and regex wrapping.

```ts
private weekdayVocab(): string[] {
    return [
        'monday', 'tuesday', /* … full list, longest-first per locale … */
        'mon', 'tue', /* … */
        'montag', 'dienstag', /* … */
        'mit', 'di', 'do', /* … */
        /* … all other locales … */
    ];
}
```

Sort each locale's entries longest-first (already done in the current arrays). The sort is the only invariant the tokenizer relies on.

**Why:** Removes the last structural dependency on regex assembly. Recognizers reference these arrays directly.

---

### Step 3 — Implement recognizer functions

Add private methods. Each has signature:
`recognizeX(input: string, pos: number): { token: Token; end: number } | null`

`pos` is the current cursor. Returns `null` when the recognizer does not match at `pos`. The helper `wordEnd(input, pos)` returns `true` when `pos` is at end-of-string or followed by whitespace — replicates the `(?=\s|$)` fix from #170.

| Method | Matches |
|--------|---------|
| `recognizeFlag` | `task` / `todo` at `pos`, followed by word boundary |
| `recognizeShortcut` | `today\|tod\|tomorrow\|tom\|yesterday\|yes\|0` + word boundary |
| `recognizeOffset` | `+N` or `-N` |
| `recognizeWeekNum` | `w<digits>` or `week<digits>` |
| `recognizeWeek` | `w` or `week` standalone (no digits follow) |
| `recognizeModifier` | `next\|last\|n\|l` + word boundary |
| `recognizeWeekday` | scan `weekdayVocab()` longest-first, word boundary check |
| `recognizeISO` | `YYYY-MM-DD`, `MM-DD`, `DD` numeric patterns |
| `recognizeMonth` | scan `monthVocab()` longest-first, word boundary check |
| `recognizeDayOfMonth` | 1–31 integer, word boundary |
| `recognizeText` | consume remainder (always succeeds) |

**Ambiguity flag:** `recognizeWeekday` and `recognizeMonth` set `ambiguous = true` when the matched token is ≤3 characters and a longer alternative in the vocab exists (e.g. `mar` matched but `march` / `martes` / `mars` also start with it). The caller uses this to set `confidence = 'ambiguous'`.

**Why:** Each recognizer is independently unit-testable. Word-boundary is enforced by `wordEnd()` in one place — no per-recognizer lookahead.

---

### Step 4 — Implement `tokenize(input, locale)`

```ts
private tokenize(input: string, locale: string): TokenizeResult {
    const tokens: Token[] = [];
    let pos = 0;
    let ambiguous = false;
    let hasTemporal = false;
    // skip leading whitespace
    // try recognizers in priority order; advance pos on match
    // … loop until pos >= input.length or only text remains …
    const confidence: ParseConfidence = hasTemporal
        ? (ambiguous ? 'ambiguous' : 'resolved')
        : 'text-only';
    return { tokens, confidence };
}
```

Priority order: `flag` → `shortcut` → `offset` → `weekNum` → `week` → `modifier`+`weekday` → `iso` → `month`+`dayOfMonth` → `flag` (post) → `text`.

`modifier` is consumed greedily and paired with the next `weekday` or `week` token. If no weekday/week follows, re-emit modifier value as part of the `text` fallback.

**Why:** Priority order is explicit in code, not hidden inside regex alternation order.

---

### Step 5 — Implement `tokensToInput(tokens, granularity, today)`

Private method that replaces `extractOffset`, `extractWeek`, `extractFlags`, `extractText`, `hasTemporalToken`. Maps `Token[]` → `Input`.

**Moment replacements inline:**

| Old | New |
|-----|-----|
| `moment().week()` | `getCurrentISOWeek(new Date())` |
| `moment()` (bare) | `new Date()` |
| `moment().subtract(1,'week').week()` | `getCurrentISOWeek(new Date(Date.now() - 7*24*60*60*1000))` |
| `moment().add(1,'week').week()` | `getCurrentISOWeek(new Date(Date.now() + 7*24*60*60*1000))` |
| `moment().month(m).date(d).diff(current,'days')` | `Date.UTC` arithmetic (same pattern as existing `resolveISOString`) |

`getCurrentISOWeek` is already exported from `src/util/dates.ts`. No new helpers needed.

**Why:** All moment calls in this file are simple date arithmetic — replaceable without changing behaviour.

---

### Step 6 — Parallel phase in `parseInput()`

Run both paths, log when results differ. No behaviour change for callers.

```ts
const regexInput = /* existing regex path result */;
const { tokens, confidence } = this.tokenize(inputString, this.locale);
const tokenInput = this.tokensToInput(tokens, this.granularity, this.today);
tokenInput.confidence = confidence;

if (!inputsEqual(regexInput, tokenInput)) {
    this.logger.warn('tokenizer divergence:', JSON.stringify({ regexInput, tokenInput }));
}

return regexInput; // regex still authoritative during this phase
```

`inputsEqual` compares `offset`, `week`, `flags`, `text` fields.

**Why:** Surfaces divergences in the test workspace before cutover. Each divergence becomes a targeted test case.

---

### Step 7 — Parity phase

- Collect divergences from Step 6 in manual and automated test runs.
- Add a test case for each divergence to `src/test/suite/input.test.ts` or `week-input.test.ts`.
- Fix the tokenizer until divergences reach zero.
- Extend `match-input-vocab.test.ts` (Step 8) as new cases are found.

---

### Step 8 — New property-based vocab test file

Create `src/test/suite/match-input-vocab.test.ts`.

**Test scenarios:**

| Scenario name | Input examples | Expected |
|--------------|----------------|----------|
| `shortcut — today` | `today`, `tod` | offset=0 |
| `shortcut — tomorrow` | `tomorrow`, `tom` | offset=+1 |
| `shortcut — yesterday` | `yesterday`, `yes` | offset=-1 |
| `offset — positive` | `+2`, `+14` | offset=N |
| `offset — negative` | `-1`, `-7` | offset=-N |
| `ISO — full date` | `2024-06-15` | offset from today |
| `ISO — month-day` | `06-15` | offset from today |
| `ISO — day only` | `15` | offset from today |
| `weekday — plain` | `monday`, `mon`, `montag` | diff to target day |
| `weekday — next modifier` | `next monday`, `n monday` | +7 or diff |
| `weekday — last modifier` | `last friday`, `l fri` | -7 or diff |
| `German weekday abbrev` | `di`, `do`, `fr` | correct day, confidence=ambiguous |
| `prefix collision — no false positive` | `Don Julio`, `Frau M`, `Marketing` | text-only |
| `week — current` | `w`, `week` | current ISO week |
| `week — next/last` | `next week`, `last week` | ±1 week |
| `week — numbered` | `w23`, `week 23` | week=23 |
| `month + day` | `Jun 1`, `März 15`, `Mayo 3` | offset from today |
| `task flag pre` | `task monday ...` | flag=task + weekday |
| `task flag post` | `monday task ...` | flag=task + weekday |
| `memo auto-flag` | `hello world` | flag=memo, text=hello world |
| `granularity weekly — empty` | `""` + weekly granularity | current week |
| `vocab sweep — all weekday abbrevs` | each entry in `weekdayVocab()` as standalone input | correct weekday, no crash |
| `vocab sweep — no false positive` | everyday words sharing prefixes (`Don`, `Fri`, `Mar`, `Sam`, `Son`) | text-only |

**Why:** Spec requirement — proves the tokenizer is at least as good as the regex and closes the #170 bug class exhaustively.

---

### Step 9 — Update `Dialogues` for colour feedback

In `src/vscode/dialogues.ts`, inside the `onDidChangeValue` handler (around line 83), after `parseInput()` resolves:

```ts
this.parser.parseInput(val).then((parsed: Input) => {
    // existing item-assembly logic unchanged …

    // NEW: drive border colour from parse confidence
    if (parsed.confidence === 'resolved') {
        input.validationMessage = {
            message: this.generateDescription(parsed),
            severity: vscode.QuickInputSeverity.Info        // blue
        };
    } else if (parsed.confidence === 'ambiguous') {
        input.validationMessage = {
            message: this.generateDescription(parsed),
            severity: vscode.QuickInputSeverity.Warning     // yellow
        };
    } else {
        input.validationMessage = undefined;                // default border
    }
});
```

`vscode.QuickInputSeverity` is available since VS Code 1.70 (extension minimum is 1.118).

---

### Step 10 — Cutover

Once `npm test` passes with zero divergence warnings:
1. Switch `parseInput()` to return `tokenInput` instead of `regexInput`.
2. Remove the `getExpression()` method, `this.expr` cache field, and the parallel-run scaffolding.
3. Remove `import moment` from `match-input.ts`.
4. Run `npm run check` — lint + compile + full test.

---

## Dependencies

- `getCurrentISOWeek` already exported from `src/util/dates.ts` — no new helper needed.
- `getDayOfWeekForString` and `getMonthForString` in `src/util/dates.ts` are used by the mapper (`tokensToInput`) for weekday-number and month-index resolution — unchanged.
- `vscode.QuickInputSeverity` — available at the extension's minimum VS Code version (1.118).

## Risk

| Risk | Mitigation |
|------|-----------|
| Edge case in ISO date parsing | Parallel phase logs divergences; existing 30 `input.test.ts` cases cover the main paths |
| German/Dutch 2-letter abbrevs still leak | Vocab sweep test (Step 8) explicitly tests `do`, `di`, `fr`, `sa`, `so`, `vr`, `za`, `zo` as standalone and prefix |
| `tokensToInput` week arithmetic differs from moment | `resolveRelatedWeek` has its own test scenario; `Date.now() ± 7 days` is equivalent to `moment().add/subtract(1, 'week')` for week-number purposes |
| `confidence` on `Input` breaks callers | Field is optional — existing callers reading `input.confidence` would get `undefined`, not an error |

## Rollback

Git revert of the cutover commit (Step 10) restores the regex path. The parallel phase (Steps 6–7) is backward-compatible by construction — revert is a one-commit operation at any point.

## Reference spec

[docs/specs/2026-06-01-177-smart-input-parser.md](../specs/2026-06-01-177-smart-input-parser.md)
