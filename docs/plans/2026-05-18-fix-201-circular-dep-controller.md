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
and `Dialogues` (added as part of earlier work). Three direct imports are still missing:
`Configuration`, `Logger`, and `isNullOrUndefined`. Add those, remove the barrel import, then
update the 15 `J.*` type annotations and one function call that still reference `J.VSCode.*`,
`J.Journal.*`, and `J.Util.*`.

No interface extraction, no injection changes — the approval comment noted those as
long-term goals; this issue is scoped to breaking the barrel cycle only.

## Steps

1. **Add three missing direct imports** in `src/util/controller.ts`:
   - `import { Configuration } from '../vscode/conf'`
   - `import { Logger } from './logger'`
   - `import { isNullOrUndefined } from './util'`

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
   | `J.Util.Logger` | `Logger` | After step 1 |
   | `J.Util.isNullOrUndefined` | `isNullOrUndefined` | After step 1 |

   Affected locations in the file (15 references + 1 call):
   - Field declarations: `_config`, `_ui`, `_parser`, `_writer`, `_reader`, `_logger`, `_inject`
   - Constructor: `new J.VSCode.Configuration(...)`
   - `initServices`: `logger as J.Util.Logger`
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

None. `controller.ts` already contains direct imports for 5 of the 8 classes (from prior work);
only 3 new import lines are needed.

## Risk

Low. All types used in the updated annotations are already in scope via the direct imports added
earlier (#212 or equivalent). The barrel import line is the only thing routing these names through
`J.*`; removing it and redirecting the names is a compile-time-only change.

ESLint `camelCase`/`PascalCase` rule: all new import names (`Configuration`, `Logger`,
`isNullOrUndefined`) satisfy it.

## Rollback

Revert the single commit on the PR. No migration, no data change, no release artifact change.
