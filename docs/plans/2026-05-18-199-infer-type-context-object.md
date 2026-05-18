# Plan: Decouple inferType from Raw Positional Arguments (#199)

## Reference spec
[docs/specs/2026-05-18-199-infer-type-context-object.md](../specs/2026-05-18-199-infer-type-context-object.md)

## Approach

Introduce `InferTypeContext` in `src/journal/paths.ts` (colocated with `inferType` — approved in spec review). Change the function signature from `(entry, extension: string)` to `(entry, ctx: InferTypeContext)`. Update both call sites in `scan-entries.ts`. No logic changes — pure structural refactor.

Trade-off: keeping the interface in `paths.ts` rather than `src/model/interfaces.ts` maximises local cohesion at the cost of discoverability. Correct per YAGNI until a second consumer appears.

## Steps

### 1 — Add `InferTypeContext` and update `inferType` (`src/journal/paths.ts`)

Define the interface immediately above the function:

```typescript
export interface InferTypeContext {
    extension: string;
}
```

Change signature:

```typescript
export function inferType(entry: Path.ParsedPath, ctx: InferTypeContext): J.Model.JournalPageType
```

Replace `extension` references inside the body with `ctx.extension`.

### 2 — Update call sites (`src/features/entries/scan-entries.ts`)

Two occurrences (lines 68 and 140 at time of writing):

```typescript
// before
entry.type = J.Journal.inferType(Path.parse(entry.path), this.config.getFileExtension());
// after
entry.type = J.Journal.inferType(Path.parse(entry.path), { extension: this.config.getFileExtension() });
```

### 3 — Verify compile

```bash
npm run compile          # esbuild — extension bundle
npm run compile-tests    # tsc — catches type errors in tests
```

### 4 — Run tests

```bash
npm test
```

All existing tests must pass unchanged (no logic change).

## Test scenarios

- **Compile clean:** `npm run compile` and `npm run compile-tests` both exit 0, no TS errors
- **Regression — attachment detection:** file with non-matching extension → `JournalPageType.attachement`
- **Regression — entry detection:** file whose name matches `/^[\d|\-|_]+$/` with matching extension → `JournalPageType.entry`
- **Regression — note detection:** file with matching extension but alphanumeric name → `JournalPageType.note`
- **Extensibility proof:** adding `weeklyFilePattern?: string` to `InferTypeContext` requires touching only `paths.ts` — confirmed by grep: no other file imports `InferTypeContext`

## Dependencies

None. Self-contained structural change; no other open PR touches `inferType` or its call sites.

## Risk

Low. Pure signature refactor — no logic change, no new code paths. Covered entirely by the existing test suite plus compile checks.

## Rollback

`git revert <commit>` — single commit, no data or config side effects.
