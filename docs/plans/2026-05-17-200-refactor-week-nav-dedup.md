# Plan: Deduplicate week-navigation logic (R3) — #200

**Reference spec:** [docs/specs/2026-05-17-200-refactor-week-nav-dedup.md](../specs/2026-05-17-200-refactor-week-nav-dedup.md)

## Approach

Surgical extraction: move the 6-line block into a new exported function and replace both call sites. No behaviour change. All existing tests are regression guards — they run unchanged and must stay green. New unit tests cover the extracted function directly, without going through the full command layer.

Trade-off: importing `Input` from `'../model'` in `navigation.ts` adds a domain→model dependency that wasn't there before. This is acceptable; `navigation.ts` already returns `Date` objects and `Anchor` structs that the command layer converts to `Input`. Returning an `Input` directly shortens the command glue to two lines.

## Steps

### 1 — Add imports to `src/actions/navigation.ts`

Add at top of file:

```typescript
import { getWeekFromURIAndConfig } from '../util/paths';
import { Input } from '../model';
import moment = require("moment");
```

**Why:** the new function delegates to `getWeekFromURIAndConfig` (already used by the two command files) and returns an `Input` so callers need zero additional allocation.

### 2 — Add `getAdjacentWeekInput` to `src/actions/navigation.ts`

Export the following function (full body in spec):

```typescript
export async function getAdjacentWeekInput(
    editor: vscode.TextEditor | undefined,
    ctrl: Ctrl,
    direction: Direction
): Promise<Input | undefined>
```

Implementation detail:
- Guard: if no editor → return `undefined`.
- Call `getWeekFromURIAndConfig(editor.document.uri, ctrl.config)`.
- If no match → return `undefined` (caller falls through to daily-entry navigation).
- Compute adjacent week with `moment().week(weekInfo.week).weekYear(weekInfo.year)[direction === 'previous' ? 'subtract' : 'add'](1, 'week')`.
- Set `input.week = adj.week()` and return.

**Why:** ternary on `direction` eliminates the only difference between the two duplicated blocks.

### 3 — Refactor `src/provider/commands/open-previous-entry.ts`

- Remove `import { getWeekFromURIAndConfig } from '../../util/paths'`.
- Remove `import moment = require("moment")`.
- Replace the duplicated 6-line block with:

```typescript
const weekInput = await getAdjacentWeekInput(editor, this.ctrl, 'previous');
if (weekInput) {
    await this.execute(weekInput);
    return;
}
```

Add `getAdjacentWeekInput` to the import from `'../../actions/navigation'`.

**Why:** removes the dead imports, leaves command as pure glue.

### 4 — Refactor `src/provider/commands/open-next-entry.ts`

Identical to Step 3, but `direction` = `'next'`.

### 5 — Add unit tests

Add a new `suite('getAdjacentWeekInput')` block in `src/test/suite/commands-prev-next.test.ts`, under the existing `helper layer with seeded base` suite. Scenarios:

| # | Name | Setup | Expected |
|---|------|-------|----------|
| T1 | no editor | `editor = undefined` | returns `undefined` |
| T2 | non-weekly file | open a day entry `${tmpBase}/2026/05/16.md` as active | returns `undefined` |
| T3 | weekly file + next | create and open `${tmpBase}/2026/w20.md`; call with `'next'` | `input.week === 21` |
| T4 | weekly file + previous | same weekly file; call with `'previous'` | `input.week === 19` |

Seed weekly files using the same `vscode.workspace.fs.createDirectory` + `writeFile` pattern as `seedEntry`. Weekly file naming follows the default pattern: `${year}/w${week}.md`.

**Why:** tests target the pure extracted logic, not the full command stack — fast and focused.

### 6 — Compile and test

```bash
npm run compile-tests && npm test
```

Full `npm run check` must pass (lint + compile + test).

## Test scenarios summary

- **T1–T2** (non-weekly): guard conditions; confirm function does not return an Input for inapplicable files.
- **T3–T4** (weekly): confirm direction-to-add/subtract mapping and that the returned `Input.week` is correct.
- **Regression**: all 16 existing navigation tests in `commands-prev-next.test.ts` must pass unchanged — they cover the command-layer behaviour end-to-end.

## Dependencies

None. Work is self-contained within this repo and does not require any other PR to land first.

## Risk

**Week-boundary crossing (week 52/53 → week 1):** pre-existing moment behaviour, not changed by this refactoring. Covered by the fact that moment's `.weekYear()` handles it correctly; no test added here since behaviour is unchanged.

**Import cycle:** `navigation.ts` → `../model` → no back-edge into `navigation.ts`. No cycle introduced.

## Rollback

`git revert <commit>` on the single implementation commit. No data migrations, no schema changes.
