---
issue: "#201"
date: 2026-05-18
slug: fix-201-circular-dep-controller
spec: docs/specs/2026-05-17-fix-201-circular-dep-controller.md
---

# Plan: Fix circular dependency in `src/util/controller.ts` (#201)

## Reference spec

[docs/specs/2026-05-17-fix-201-circular-dep-controller.md](../specs/2026-05-17-fix-201-circular-dep-controller.md)

## Approach

Single-file edit. The file already has direct imports for `Parser`, `Writer`, `Reader`, `Inject`,
and `Dialogues` (added as part of earlier work). `ILogger` is also already imported from
`../model`. Two direct imports are still missing: `Configuration` and `isNullOrUndefined`. Add
those, remove the barrel import, then update the 15 `J.*` type annotations and one function call.

**Amendment (approved):** `_logger` field and `logger` getter are typed as `ILogger` (not the
concrete `Logger` class), removing the unsafe cast in `initServices`. All callers verified to use
only `ILogger` methods. No `Logger` concrete import needed.

## Steps

1. **Add two missing direct imports** in `src/util/controller.ts`:
   - `import { Configuration } from '../vscode/conf'`
   - `import { isNullOrUndefined } from './util'`

   `ILogger` is already imported from `../model` (line 25). No `Logger` concrete import needed.

2. **Remove barrel import**: delete line `import * as J from '../.'`.

3. **Update type annotations and usages** — all occurrences in the same file:

   | Old | New | Already imported? |
   |-----|-----|-------------------|
   | `J.VSCode.Configuration` | `Configuration` | After step 1 |
   | `J.VSCode.Dialogues` | `Dialogues` | Yes (line 30) |
   | `J.Journal.Parser` | `Parser` | Yes (line 26) |
   | `J.Journal.Writer` | `Writer` | Yes (line 27) |
   | `J.Journal.Reader` | `Reader` | Yes (line 28) |
   | `J.Journal.Inject` | `Inject` | Yes (line 29) |
   | `J.Util.Logger` (field + getter) | `ILogger` | Yes (line 25) |
   | `J.Util.isNullOrUndefined` | `isNullOrUndefined` | After step 1 |

   Affected locations in the file (15 references + 1 call):
   - Field declarations: `_config`, `_ui`, `_parser`, `_writer`, `_reader`, `_logger`, `_inject`
   - Constructor: `new J.VSCode.Configuration(...)`
   - `initServices`: `logger as J.Util.Logger` → `logger` (cast removed; both `ILogger`)
   - Getter return types: `ui`, `writer`, `reader`, `parser`, `config`, `inject`, `logger`
   - Logger guard: `J.Util.isNullOrUndefined(this._logger)`

4. **Run acceptance checks** locally:
   ```
   npm run compile
   npm run lint
   npm test
   ```

5. **Open PR** against `develop`, referencing `#201`.

## Test scenarios

| Scenario | Type | Covers |
|----------|------|--------|
| **No barrel import** — grep `controller.ts` for `import \* as J` returns empty | static | AC 1 |
| **No J. references** — grep `controller.ts` for `J\.` returns empty | static | AC 1 |
| **Compile clean** — `npm run compile` exits 0 | build | AC 2 |
| **Lint clean** — `npm run lint` exits 0 with no new warnings | lint | AC 4 |
| **Full suite green** — `npm test` passes all existing tests | integration | AC 3 |

No new unit tests required; this is a pure import-path change with no behavior delta.

## Dependencies

**#208 (PR #214) — merged.** Sequencing mandate from final approval: this PR must build on the
post-#208 version of `controller.ts`. PR #214 merged into `develop`; implementation branches from
current `develop`. Sequencing constraint is satisfied.

## Risk

Low. All types used in the updated annotations are already in scope via existing direct imports or
`../model`. The barrel import line is the only thing routing these names through `J.*`; removing
it and redirecting the names is a compile-time-only change.

ESLint `camelCase`/`PascalCase` rule: new import names (`Configuration`, `isNullOrUndefined`) satisfy it.

## Rollback

Revert the single commit on the PR. No migration, no data change, no release artifact change.
