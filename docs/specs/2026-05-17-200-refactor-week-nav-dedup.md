# Spec: Deduplicate week-navigation logic (R3) — #200

## Goal

Extract the identical week-navigation block from `OpenNextEntryCommand` and `OpenPreviousEntryCommand` into a single shared function in `src/actions/navigation.ts`.

## Why now

The block was added to both commands in the same PR (navigation 1.1.0 work). It is not yet stable, so the duplication has not yet masked a divergence bug — but the longer it lives in two places the more likely a future fix lands in only one.

## In scope

- New exported function `getAdjacentWeekInput(editor, ctrl, direction)` in `src/actions/navigation.ts`.
- Replace the 6-line duplicated block in `open-next-entry.ts` and `open-previous-entry.ts` with a call to the new function.
- Unit test for `getAdjacentWeekInput` covering: weekly file → correct week returned; non-weekly file → `undefined` returned; direction `next` adds one week; direction `previous` subtracts one week.

## Out of scope

- Any change to the week-number/year-crossing logic (pre-existing moment behaviour).
- `getWeekFromURIAndConfig` itself (stays in `paths.ts`).
- UI or command registration changes.

## Acceptance criteria

1. No duplicated week-navigation code remains in the command files.
2. Both commands behave identically to before — existing navigation tests pass unchanged.
3. New unit tests for `getAdjacentWeekInput` green.
4. `npm run check` (lint + compile + test) passes.

## New function contract

```typescript
// src/actions/navigation.ts
export async function getAdjacentWeekInput(
    editor: vscode.TextEditor | undefined,
    ctrl: Ctrl,
    direction: Direction            // 'previous' | 'next'
): Promise<J.Model.Input | undefined>
```

Returns a populated `Input` (with `input.week` set to the adjacent week number) when the active file is a weekly note, `undefined` otherwise (callers proceed to daily-entry navigation).

**Internals** (replaces the duplicated block):

```typescript
if (!editor) return undefined;
const weekInfo = await getWeekFromURIAndConfig(editor.document.uri, ctrl.config);
if (!weekInfo) return undefined;
const adj = moment()
    .week(weekInfo.week)
    .weekYear(weekInfo.year)
    [direction === 'previous' ? 'subtract' : 'add'](1, 'week');
const input = new J.Model.Input();
input.week = adj.week();
return input;
```

## Constraints

- Keep `moment` import in `navigation.ts` (already present).
- Must remain testable without a live `vscode.TextEditor` — the non-`undefined` code path reaches `getWeekFromURIAndConfig` which calls `config` methods; spy/stub those in tests as done elsewhere.

## Open questions

None.

## Related issues

- Spawned from the navigation work tracked in #144 / docs-sync #189.
