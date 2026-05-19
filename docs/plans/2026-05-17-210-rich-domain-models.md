# Plan: Rich Domain Models (#210)

**Spec:** [docs/specs/2026-05-17-210-rich-domain-models.md](../specs/2026-05-17-210-rich-domain-models.md)
**Revision 2** — amended after plan review; method moves to `NoteInput`, regex hardened, state initialized at construction.

## Approach

`extractScopeAndTags` lives on `NoteInput`, not base `Input`. `LoadNotes` constructor narrows to `NoteInput`; `show-entry-for-date.ts` already has an `instanceof NoteInput` guard (TypeScript narrows there automatically); `show-note.ts` adds a single type assertion. Cascade is two lines.

`SCOPE_DEFAULT` moves from `src/vscode/conf.ts` to `src/model/config.ts`. `Input._scope` initializes to `SCOPE_DEFAULT` in the field declaration — `extractScopeAndTags` only updates scope on a match, never resets.

Regex changes from `/#\w+\s/g` to `/#\w+(?:\s|$)/g` to handle tags at end-of-string (e.g. `"note #work"`). Tag string trimmed after match rather than by length arithmetic.

MatchInput DRY (point 2 from review): `MatchInput.extractTags` uses a different regex with leading-space requirement (`/\s#\w+\s/`) and parses from raw input string — semantically different from state mutation. Consolidation requires redesigning MatchInput. Out of scope; tracked as follow-up.

## Steps

1. **Add `SCOPE_DEFAULT` to `src/model/config.ts`**
   - Why: domain constant belongs in domain layer; enables `input.ts` to import it without a layer violation
   - Append `export const SCOPE_DEFAULT: string = "default";`
   - Add `SCOPE_DEFAULT` to the `src/model/index.ts` re-export line for `./config`

2. **Update `src/vscode/conf.ts` to re-export from model**
   - Why: all existing callers import `SCOPE_DEFAULT` via `../../vscode` — preserve that path with zero changes to callers
   - Remove: `export const SCOPE_DEFAULT: string = "default";`
   - Add: `export { SCOPE_DEFAULT } from '../model/config';`

3. **Initialize `Input._scope` to `SCOPE_DEFAULT` and add `extractScopeAndTags` to `NoteInput`**
   - In `src/model/input.ts`:
     - Import `SCOPE_DEFAULT` from `./config`
     - Change field declaration: `private _scope: string = SCOPE_DEFAULT;`
     - Add method to `NoteInput`:
       ```typescript
       public extractScopeAndTags(availableScopes: string[]): void {
           this.text.match(/#\w+(?:\s|$)/g)?.forEach(match => {
               const tag = match.trim(); // "#work"
               this._tags.push(tag);
               this._text = this._text.replace(match, " ");
               const scopeName = tag.substring(1); // "work"
               const matched = availableScopes.find(name => name === scopeName);
               if (matched) { this._scope = matched; }
           });
       }
       ```
   - Why no reset at method start: scope is already `SCOPE_DEFAULT` from construction; method only updates when a scope match is found; calling it twice is safe (idempotent on state already set)
   - `_tags` and `_text` are private — access from within `NoteInput` is direct field access

4. **Narrow `LoadNotes` constructor to `NoteInput`**
   - `src/features/entries/load-note.ts`: change `public input: J.Model.Input` → `public input: J.Model.NoteInput`
   - Why: `load()` calls `resolveNotePathForInput` which now uses `extractScopeAndTags` on `NoteInput`; correct typing prevents misuse
   - `src/commands/show-entry-for-date.ts:127`: inside `instanceof NoteInput` guard — TypeScript already narrows; no change needed
   - `src/commands/show-note.ts:53`: add type assertion `parsedInput as J.Model.NoteInput` — safe because `ShowNote` command only processes note inputs

5. **Refactor `Parser.resolveNotePathForInput` in `src/journal/parser.ts`**
   - Replace the `input.scope = SCOPE_DEFAULT` + `input.text.match(...)?.forEach(...)` block (lines 50–62) with:
     ```typescript
     (input as NoteInput).extractScopeAndTags(this.config.getScopes());
     ```
   - Why cast: `IParser.resolveNotePathForInput` keeps `Input` param for interface stability; cast is safe because all runtime callers pass `NoteInput`
   - Remove now-unused `SCOPE_DEFAULT` import from `'../vscode'`
   - Remove `isNullOrUndefined`/`isNotNullOrUndefined` imports if unused elsewhere in the file

6. **Write unit tests for `extractScopeAndTags`**
   - Add to `src/test/suite/input.test.ts`
   - Why: pure sync method, no vscode API, no config dep — tests run without extension host
   - Test scenarios:
     - `noTags`: text `"my note"`, scopes `[]` → scope = `SCOPE_DEFAULT`, tags = `[]`, text unchanged
     - `namedScopeMatch`: text `"my note #work "`, scopes `["work"]` → scope `"work"`, tags `["#work"]`, tag stripped from text
     - `noScopeMatch`: text `"my note #unknown "`, scopes `["work"]` → scope `SCOPE_DEFAULT`, tags `["#unknown"]`, stripped
     - `multipleTags`: text `"note #work #meeting "`, scopes `["work"]` → scope `"work"`, both tags collected
     - `tagAtEndOfString`: text `"note #work"` (no trailing space), scopes `["work"]` → scope `"work"`, tag collected (regex fix coverage)

## Test scenarios

| Name | Input text | Available scopes | Expected scope | Expected tags | Regex coverage |
|------|-----------|-----------------|----------------|---------------|----------------|
| noTags | `"my note"` | `[]` | `SCOPE_DEFAULT` | `[]` | — |
| namedScopeMatch | `"my note #work "` | `["work"]` | `"work"` | `["#work"]` | trailing space |
| noScopeMatch | `"my note #unknown "` | `["work"]` | `SCOPE_DEFAULT` | `["#unknown"]` | trailing space |
| multipleTags | `"note #work #meeting "` | `["work"]` | `"work"` | `["#work","#meeting"]` | trailing space |
| tagAtEndOfString | `"note #work"` | `["work"]` | `"work"` | `["#work"]` | end-of-string `$` |

All scenarios: unit tests, no vscode API, no config stub.

## Dependencies

- #209 (domain module rename) must merge to `develop` before implementation branch is created.

## Risk

- `NoteInput` accessing `_tags`, `_text`, `_scope` (private fields of parent `Input`): TypeScript enforces `private` per-class. Move these fields to `protected` in `Input`, or move `extractScopeAndTags` into a method in `Input` that `NoteInput` calls via `super` — or make the fields `protected`. Simplest: change `_tags`, `_text`, `_scope` from `private` to `protected` in `Input`.
- Cast `input as NoteInput` in Parser: safe at runtime (all callers pass `NoteInput`), but bypasses type system. Document with an inline comment explaining the invariant. Alternative considered: narrow `IParser.resolveNotePathForInput` to `NoteInput` — rejected because it breaks `IParser` consumers that may hold `Input` references.
- `SCOPE_DEFAULT` re-export: compile-time only, zero runtime risk.
- `_scope` init change: `Input._scope` previously initialized to `""`. Any code that checks `input.scope === ""` (empty string) now gets `"default"` instead. Grep confirms no such check exists outside the class.

## Rollback

Revert the PR. All changes are additive or refactoring. No data changes.
