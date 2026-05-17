---
issue: "#201"
date: 2026-05-17
slug: fix-201-circular-dep-controller
plan: docs/plans/2026-05-17-fix-201-circular-dep-controller.md
---

# Spec: Fix circular dependency in `src/util/controller.ts` (R5)

## Goal

Break the direct circular import loop between `src/util/controller.ts` and `src/index.ts` by replacing the barrel import with explicit relative imports.

## Why now

`controller.ts` is the service locator used by every command and provider. It imports from `src/index.ts` (the root barrel), but `src/index.ts` itself re-exports `src/util/` — which contains `controller.ts`. This creates a direct cycle:

```
src/index.ts → src/util/index.ts → controller.ts → src/index.ts
```

Node.js resolves circular imports by returning the partially-initialized module, which can cause `undefined` values on first access (initialization order sensitive). Beyond runtime risk, the cycle blocks tree-shaking, degrades IDE navigation, and makes unit-testing `Ctrl` in isolation impossible without loading the full barrel. This fix aligns with PLAN.md Phase 2.3 ("Replace `import * as J from '..'` Pattern").

## In scope

- `src/util/controller.ts`: replace `import * as J from '../.'` with 8 direct relative imports; update all usages of `J.*` references in that file.

## Out of scope

- `src/actions/parser.ts`, `writer.ts`, `reader.ts`, `inject.ts` — these also use the barrel import; they are separate Phase 2.3 work items.
- No changes to `src/ext/`, `src/model/`, `src/provider/`, or test files.
- No behavior changes — this is a pure refactor of import paths.

## Acceptance criteria

1. `controller.ts` contains no `import * as J from` line.
2. `npm run compile` passes with no errors.
3. `npm test` passes with no regressions (all existing tests green).
4. `npm run lint` passes with no new warnings.
5. No new `import * as` barrel usage introduced.

## Entities / contracts

Direct imports that replace `import * as J from '../.'`:

| Old reference | New import |
|---|---|
| `J.Extension.Configuration` | `import { Configuration } from '../ext/conf'` |
| `J.Extension.Dialogues` | `import { Dialogues } from '../ext/dialogues'` |
| `J.Actions.Parser` | `import { Parser } from '../actions/parser'` |
| `J.Actions.Writer` | `import { Writer } from '../actions/writer'` |
| `J.Actions.Reader` | `import { Reader } from '../actions/reader'` |
| `J.Actions.Inject` | `import { Inject } from '../actions/inject'` |
| `J.Util.Logger` | `import { Logger } from './logger'` |
| `J.Util.isNullOrUndefined` | `import { isNullOrUndefined } from './util'` |

The `controller.ts` field and parameter types use these classes/interfaces directly; the only change is how they are referenced (qualified `J.*` → bare name).

## Constraints

- Must not change public API of `Ctrl` (no getter/setter signature changes).
- Must not introduce new barrel imports (`import * as X from '...'`) in the file.
- ESLint flat config requires `camelCase`/`PascalCase` import names — all direct imports satisfy this.

## Open questions

None.

## Related issues

- PLAN.md Phase 2.3: broader named-imports refactor across all action modules (separate work).
