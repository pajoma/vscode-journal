# Spec: Decouple inferType from Raw Positional Arguments (#199)

## Goal

Change `inferType` in `src/journal/paths.ts` to accept a context object instead of positional raw-value arguments, so future parameter additions don't require shotgun surgery across call sites.

## Why Now

A prior change (adding `weeklyFilePatternRaw`) forced updates to every call site of `inferType` — two in `scan-entries.ts` and the function itself in `paths.ts`. The function is a stable utility but its positional signature makes it rigid: each new classification criterion forces a signature change and cascading edits. A context object breaks that coupling.

## In Scope

- Introduce `InferTypeContext` interface in `src/journal/paths.ts` (or `src/model/interfaces.ts` if it becomes a shared type — see open questions)
- Change `inferType` signature from `(entry: Path.ParsedPath, extension: string)` to `(entry: Path.ParsedPath, ctx: InferTypeContext)`
- Update both call sites in `src/features/entries/scan-entries.ts` to pass `{ extension: this.config.getFileExtension() }`
- Update `src/journal/index.ts` re-export if the interface is defined there

## Out of Scope

- Adding new classification logic (e.g. weekly-note detection via pattern) — that is a follow-up
- Changing `JournalPageType` enum members
- Any changes to `getWeekFromURIAndConfig` or `getDateFromURIAndConfig`

## Acceptance Criteria

- `inferType` signature takes `(entry: Path.ParsedPath, ctx: InferTypeContext)` where `InferTypeContext` has at minimum `{ extension: string }`
- Both call sites in `scan-entries.ts` compile and pass `ctx` as an object literal
- `npm run compile` and `npm run compile-tests` succeed (no type errors)
- `npm test` passes (all existing tests green)
- Adding a future field to `InferTypeContext` requires touching only `paths.ts` and the struct definition — not the call sites (verified by design)

## Entities / Contracts

```typescript
// src/journal/paths.ts (or src/model/interfaces.ts)
export interface InferTypeContext {
    extension: string;
    // future fields: weeklyFilePattern?: string, etc.
}

// updated signature
export function inferType(entry: Path.ParsedPath, ctx: InferTypeContext): J.Model.JournalPageType
```

Call site (no change to call-site logic):
```typescript
// scan-entries.ts — both occurrences
entry.type = J.Journal.inferType(Path.parse(entry.path), { extension: this.config.getFileExtension() });
```

## Constraints

- `InferTypeContext` must have zero `vscode` imports — `paths.ts` is domain code
- Keep interface definition in `src/journal/paths.ts` unless a second consumer in a different module also needs it; move to `src/model/interfaces.ts` only when that second consumer appears (YAGNI)

## Open Questions

- Should `InferTypeContext` live in `src/journal/paths.ts` or `src/model/interfaces.ts`? Recommend `paths.ts` until a second consumer exists.
- Is there a planned follow-up to add weekly detection inside `inferType`? If so, the `weeklyFilePattern?: string` field should be stubbed in the interface now to validate the design.

## Related Issues

- Part of the ongoing domain-layer decoupling work (cf. #209, #212)
