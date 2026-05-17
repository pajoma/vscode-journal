# Plan: Rich Domain Models (#210)

**Spec:** [docs/specs/2026-05-17-210-rich-domain-models.md](../specs/2026-05-17-210-rich-domain-models.md)

## Approach

Move `extractScopeAndTags` to the base `Input` class (not `NoteInput` as spec drafted) because `load-note.ts` passes a base `Input` instance to `Parser.resolveNotePathForInput` — and all properties required for the method (`text`, `scope`, `tags`) are already on `Input`. Putting it on `NoteInput` would require a runtime cast or change to `load-note.ts`. Base `Input` is the correct target; `NoteInput` and `SelectedInput` inherit without change.

`SCOPE_DEFAULT` is a domain constant with value `"default"`. It moves from `src/vscode/conf.ts` (platform layer) to `src/model/config.ts` (domain layer). The vscode layer re-exports it for backward compat — zero changes to callers outside this PR.

## Steps

1. **Add `SCOPE_DEFAULT` to `src/model/config.ts`**
   - Why: domain constant does not belong in the vscode/platform layer; model layer needs it without a layer-violating import
   - Append `export const SCOPE_DEFAULT: string = "default";` to the file
   - Add `SCOPE_DEFAULT` to the `src/model/index.ts` re-export line for `./config`

2. **Update `src/vscode/conf.ts` to re-export from model**
   - Why: all existing callers import `SCOPE_DEFAULT` from `../../vscode` — this preserves that path
   - Remove: `export const SCOPE_DEFAULT: string = "default";`
   - Add: `export { SCOPE_DEFAULT } from '../model/config';`
   - Internal usages in `conf.ts` continue to work (same name, now imported rather than locally defined)

3. **Add `extractScopeAndTags(availableScopes: string[]): void` to `Input` in `src/model/input.ts`**
   - Why: base class owns the method because both `LoadNotes` (passes base `Input`) and dialogues (passes `NoteInput`) reach `resolveNotePathForInput` — no cast needed
   - Import `SCOPE_DEFAULT` from `./config`
   - Import `isNotNullOrUndefined` from `../util/util` (already has `isNullOrUndefined`)
   - Logic:
     ```typescript
     public extractScopeAndTags(availableScopes: string[]): void {
         this._scope = SCOPE_DEFAULT;
         this.text.match(/#\w+\s/g)?.forEach(tag => {
             if (isNullOrUndefined(tag) || tag.length === 0) { return; }
             this._tags.push(tag.trim().substring(0, tag.length - 1));
             this._text = this._text.replace(tag, " ");
             const scope = availableScopes.filter(name => name === tag.trim().substring(1, tag.length)).pop();
             if (isNotNullOrUndefined(scope) && scope!.length > 0) {
                 this._scope = scope!;
             }
         });
     }
     ```

4. **Refactor `Parser.resolveNotePathForInput` in `src/journal/parser.ts`**
   - Why: the inline tag-extraction loop is replaced by the model method; Parser retains path resolution
   - Replace lines 50–62 (the `input.scope = SCOPE_DEFAULT` + `input.text.match(...)?.forEach(...)` block) with:
     ```typescript
     input.extractScopeAndTags(this.config.getScopes());
     ```
   - Remove now-unused import `SCOPE_DEFAULT` from `'../vscode'` in parser.ts
   - Remove `isNullOrUndefined`, `isNotNullOrUndefined` imports if no longer used elsewhere in parser.ts

5. **Write unit tests for `extractScopeAndTags`**
   - Why: pure method with no async deps, fully testable without vscode or config
   - Add to `src/test/suite/input.test.ts` (existing file, avoids new test runner registration)
   - Test scenarios:
     - `noTags`: text `"my note"`, availableScopes `[]` → scope = `SCOPE_DEFAULT`, tags = `[]`, text unchanged
     - `namedScopeMatch`: text `"my note #work "`, availableScopes `["work"]` → scope = `"work"`, tags = `["#work"]`, text = `"my note  "`
     - `noScopeMatch`: text `"my note #unknown "`, availableScopes `["work"]` → scope = `SCOPE_DEFAULT`, tags = `["#unknown"]`, text stripped
     - `multipleTags`: text `"note #work #meeting "`, availableScopes `["work"]` → scope = `"work"`, tags = `["#work", "#meeting"]`

## Test scenarios

| Name | Input text | Available scopes | Expected scope | Expected tags | Text stripped? |
|------|-----------|-----------------|----------------|---------------|---------------|
| noTags | `"my note"` | `[]` | `SCOPE_DEFAULT` | `[]` | no |
| namedScopeMatch | `"my note #work "` | `["work"]` | `"work"` | `["#work"]` | yes |
| noScopeMatch | `"my note #unknown "` | `["work"]` | `SCOPE_DEFAULT` | `["#unknown"]` | yes |
| multipleTags | `"note #work #meeting "` | `["work"]` | `"work"` | `["#work", "#meeting"]` | yes |

All scenarios: unit tests, no vscode API, no config stub.

## Dependencies

- Branch `worktree-feat+209-domain-module-naming` must be merged first (#209 domain module rename establishes the module boundaries this refactor uses). Alternatively, branch from `develop` after #209 merges.

## Risk

- `SCOPE_DEFAULT` re-export chain: `conf.ts` is imported by many files; adding a pass-through re-export (not a definition) is safe. TypeScript resolves it at compile time, no runtime risk.
- Removing `isNullOrUndefined`/`isNotNullOrUndefined` from `parser.ts`: grep to confirm they are not used elsewhere in that file before removing.
- `extractScopeAndTags` sets `this._scope = SCOPE_DEFAULT` at the start, resetting any prior scope assignment. `Parser.resolveNotePathForInput` previously set `input.scope = SCOPE_DEFAULT` on line 50 before the loop — behavior is identical.

## Rollback

Revert the PR. All changes are additive (new method) or refactoring with no behavior change. No migration or data change involved.
