# Plan: Decouple inferType from Raw Positional Arguments (#199)

## Reference spec
[docs/specs/2026-05-18-199-infer-type-context-object.md](../specs/2026-05-18-199-infer-type-context-object.md)

## Approach

Introduce `InferTypeContext` in `src/journal/paths.ts` (colocated with `inferType` — approved in spec review). Change the function signature from `(entry, extension: string)` to `(entry, ctx: InferTypeContext)`. Update both call sites in `scan-entries.ts`. No logic changes — pure structural refactor.

Trade-off: keeping the interface in `paths.ts` rather than `src/model/interfaces.ts` maximises local cohesion at the cost of discoverability. Correct per YAGNI until a second consumer appears.

**Amendment (post-review):** Unit tests must be written against existing behavior before touching the signature, to lock down the contract empirically. All future fields in `InferTypeContext` must be optional (`?:`) — required fields would reintroduce shotgun surgery on every addition. The `|` literal in the existing regex (`/^[\d|\-|_]+$/`) is a pre-existing quirk (pipes illegal in Windows filenames, unused on Unix); it is documented in the test but not fixed in this PR.

## Steps

### 0 — Write unit tests for current `inferType` behavior (`src/test/suite/infer-type.test.ts`)

`inferType` has no VS Code dependencies — safe to run inside Extension Host suite without special plumbing. Lock down all three classification branches before touching the signature:

- attachment: extension mismatch → `JournalPageType.attachement`
- entry: `extension` matches AND name matches `/^[\d|\-|_]+$/` → `JournalPageType.entry`
- note: `extension` matches AND name is alphanumeric → `JournalPageType.note`

Include a test that confirms the current (pre-fix) behavior of `2026|05|18.md` → `entry`, so the regex fix in Step 0b is verifiable.

### 0b — Fix regex in `inferType` (`src/journal/paths.ts`)

Separate commit. Change `/^[\d|\-|_]+$/gm` → `/^[\d\-_]+$/`:

- Remove `|` literal from character class (was unintentionally included; pipe is valid on macOS/Linux)
- Remove `gm` flags (unnecessary for a single filename string match)

No classification semantics change for real-world filenames. Update the test from Step 0 to reflect corrected behavior: `2026|05|18.md` → `JournalPageType.note` after fix.

### 1 — Add `InferTypeContext` and update `inferType` (`src/journal/paths.ts`)

Define the interface immediately above the function:

```typescript
export interface InferTypeContext {
    extension: string;
    // all future fields must be optional (?: ) to prevent shotgun surgery
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

All existing tests plus the new unit tests must pass.

## Test scenarios

- **Compile clean:** `npm run compile` and `npm run compile-tests` both exit 0, no TS errors
- **Regression — attachment:** file with non-matching extension → `JournalPageType.attachement`
- **Regression — entry:** matching extension + digits/dashes/underscores name → `JournalPageType.entry`
- **Regression — note:** matching extension + alphanumeric name → `JournalPageType.note`
- **Regex fix verified:** `2026|05|18.md` → `JournalPageType.note` after Step 0b (pipe no longer in character class)
- **Extensibility proof:** adding `weeklyFilePattern?: string` to `InferTypeContext` requires touching only `paths.ts`

## Dependencies

None. Self-contained structural change; no other open PR touches `inferType` or its call sites.

## Risk

Low. Pure signature refactor — no logic change, no new code paths. Covered entirely by the existing test suite plus compile checks.

## Rollback

`git revert <commit>` — single commit, no data or config side effects.
