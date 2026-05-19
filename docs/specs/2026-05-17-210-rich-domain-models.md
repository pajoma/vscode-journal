# Spec: Rich Domain Models (#210)

**Revision 2** — amended after architectural review; `resolveNotePath` removed from model scope.

## Goal
Enrich `NoteInput` with pure internal-state transformations (tag/scope extraction) while keeping service-layer orchestration (path resolution) in `Parser`. The model layer stays a dependency-free leaf.

## Why now
The anemic `Input` class forces callers to reach into `Parser` for logic that is semantically owned by the input itself. #209 (domain module rename) established clean module boundaries, making this safe. Path resolution stays in the service layer to preserve layer purity and avoid a circular dependency (`interfaces.ts` already imports `Input`, so `input.ts` cannot import `IConfiguration` from `interfaces.ts`).

## In scope
- Move tag/scope extraction from `Parser.resolveNotePathForInput` into `NoteInput` as `extractScopeAndTags(availableScopes: string[]): void`
  - Mutates `this.scope` from matched scope or defaults to `SCOPE_DEFAULT`
  - Strips matched `#tag` tokens from `this.text`
  - Populates `this.tags`
- `Parser.resolveNotePathForInput` refactored to: call `input.extractScopeAndTags(this.config.getScopes())` then own path resolution logic (no behavior change, just moved extraction call)
- Unit tests for `extractScopeAndTags` in isolation (no config dep — only takes `string[]`)

## Out of scope
- `resolveNotePath` on `NoteInput` — rejected: would require `IConfiguration` import, causing circular dep with `interfaces.ts`
- `parseInput` / `MatchInput` — stays in `Parser`
- `generateDate` — already in model, no change
- `IParser` interface — no change
- `getDateFromURI` or other `paths.ts` utilities
- `SelectedInput` semantics

## Acceptance criteria
1. `NoteInput.extractScopeAndTags(availableScopes: string[]): void` exists in `src/model/input.ts`
2. Given `text = "my note #work "` and `availableScopes = ["work"]`: after call, `scope === "work"`, `tags === ["#work"]`, `text === "my note  "` (tag stripped)
3. Given no matching scope: `scope === SCOPE_DEFAULT`, `tags` populated, text stripped
4. `Parser.resolveNotePathForInput` calls `input.extractScopeAndTags(...)` then performs path resolution (≤15 lines total, no inline tag-regex loop)
5. All existing tests pass unchanged
6. New unit tests cover: default scope, named scope match, multiple tags, text stripping

## Entities / contracts

### `NoteInput.extractScopeAndTags` (src/model/input.ts)

```typescript
extractScopeAndTags(availableScopes: string[]): void
```

Logic (pure, no async):
1. Match `/#\w+\s/g` against `this.text`
2. For each match:
   - Push trimmed tag to `this.tags`
   - Strip match from `this.text`
   - If tag (without `#`) matches an entry in `availableScopes`, set `this.scope = matchedScope`
3. Default `this.scope = SCOPE_DEFAULT` if no scope match found

Imports needed: `SCOPE_DEFAULT` constant. Must not import from `../journal`, `../vscode`, or `./interfaces`.

### `Parser.resolveNotePathForInput` refactor (src/journal/parser.ts)

Replaces inline tag-loop with:
```typescript
input.extractScopeAndTags(this.config.getScopes());
```
Then continues with existing path-resolution logic unchanged.

## Constraints
- `src/model/input.ts` must not import from `./interfaces` (circular: `interfaces.ts` → `input.ts`)
- `src/model/` must not import from `src/journal/` or `src/vscode/`
- `SCOPE_DEFAULT` import source: `src/vscode/vscode.ts` — check if allowed or re-export from `util`

## Open questions
- None. `SCOPE_DEFAULT = "default"` is defined in `src/vscode/conf.ts` — model layer cannot import from there. Resolution: move the constant to `src/model/config.ts` (it is a domain concept, not a vscode concern) and re-export it from `src/vscode/index.ts` for backward compatibility.

## Related issues
- Related: #209 (domain module rename — module boundaries this refactor depends on)
- Related: #208 (constructor injection — uses `IParser` interface; no conflict)
- Related: #201 (circular dep constraint on `src/model/` imports)
