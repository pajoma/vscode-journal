# Spec: Rich Domain Models (#210)

## Goal
Move path-resolution and scope/tag-extraction business logic from `Parser` into the `Input`/`NoteInput` model classes, making the domain layer the primary owner of journaling invariants.

## Why now
The anemic `Input` class forces callers to reach into `Parser` for logic that is semantically owned by the input itself. This has caused duplication as multiple actions independently re-implement the same tag-extraction and scope-resolution steps. #209 (domain module rename) has already established clean module boundaries, making this refactor low-risk.

## In scope
- Move tag/scope extraction from `Parser.resolveNotePathForInput` into `Input` as `extractScopeAndTags(availableScopes: string[]): void`
- Add `resolveNotePath(config: IConfiguration): Promise<string>` to `NoteInput` — full path-resolution logic (tag extraction + path template expansion)
- `Parser.resolveNotePathForInput` delegates to `input.resolveNotePath(this.config)` (thin adapter; `IParser` interface stays unchanged)
- Unit tests for new `NoteInput` methods in isolation (no mocked `Parser`, real `IConfiguration` stub)

## Out of scope
- `parseInput` / `MatchInput` — parsing user text strings stays in `Parser`
- `generateDate` on `Input` — already in the model, no change
- Any changes to `IParser` interface — callers keep using `parser.resolveNotePathForInput`
- Moving `getDateFromURI` or other `paths.ts` utilities
- Changing `SelectedInput` or `NoteInput.path` semantics

## Acceptance criteria
1. `NoteInput` has `extractScopeAndTags(availableScopes: string[]): void` — mutates `this.scope` and `this.tags`, strips tags from `this.text`
2. `NoteInput` has `resolveNotePath(config: IConfiguration): Promise<string>` — returns the full filesystem path for the note
3. `Parser.resolveNotePathForInput` body is ≤5 lines: calls `input.resolveNotePath(this.config)` and logs
4. All existing tests pass unchanged (callers use `IParser` interface, no public API break)
5. New unit tests for `extractScopeAndTags` and `resolveNotePath` covering: default scope, named scope, weekly granularity, tag stripping

## Entities / contracts

### `NoteInput` additions (src/model/input.ts)

```typescript
// Extracts #tag tokens from this.text; sets this.scope and this.tags
extractScopeAndTags(availableScopes: string[]): void

// Resolves the full filesystem path for this note using config
resolveNotePath(config: IConfiguration): Promise<string>
```

`resolveNotePath` internal steps:
1. Call `this.extractScopeAndTags(config.getScopes())`
2. Normalize filename: `normalizeFilename(this.text)`
3. Branch on `config.getEntryGranularity(this.scope)`:
   - `"weekly"` → `config.getWeeklyNotesFilePattern(...)` + `config.getResolvedWeeklyNotesPath(...)`
   - else → `config.getNotesFilePattern(...)` + `config.getResolvedNotesPath(...)`
4. `Path.join(pathTemplate.value!, fileTemplate.value!.trim())`

Imports needed in `input.ts`: `IConfiguration` from `./interfaces`, `normalizeFilename`/`getCurrentISOWeek`/`getISOWeekYear` from `../util`, `Path` from `path`.

### `Parser.resolveNotePathForInput` (src/journal/parser.ts)

Becomes:
```typescript
public async resolveNotePathForInput(input: NoteInput, scopeId?: string): Promise<string> {
    this.logger.trace("Entering resolveNotePathForInput() in journal/parser.ts");
    return input.resolveNotePath(this.config);
}
```

Note: parameter type narrows from `Input` to `NoteInput`. `IParser` interface updated to match.

## Constraints
- `src/model/` must not import from `src/journal/` or `src/vscode/` (no circular deps — see #201 fix)
- `util` imports are allowed from `src/model/`
- `Path` (node built-in) allowed in `src/model/`

## Open questions
- None after reading codebase.

## Related issues
- Related: #209 (domain module rename — sets up clean module boundaries this refactor depends on)
- Related: #208 (constructor injection — uses `IParser` interface; no conflict expected)
- Related: #201 (circular dep fix — constraint on `src/model/` imports)
