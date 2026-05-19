---
issue: "#207"
date: 2026-05-17
slug: 207-interface-journal-controller
plan: docs/plans/2026-05-17-207-interface-journal-controller.md
---

# Spec: Break circular coupling via `JournalController` interface extraction (#207)

## Goal

Introduce a `JournalController` interface in `src/model/` so that action and UI modules depend on an abstraction rather than the concrete `Ctrl` class — eliminating the barrel-import cycle in those modules.

## Why now

Every action class (`Parser`, `Writer`, `Reader`, `Inject`), the `Dialogues` class, and `Logger` type-hint `Ctrl` via `import * as J from '../.'`. Because `src/index.ts` re-exports `src/util/` (which contains `Ctrl`), and `src/util/controller.ts` itself imports from the same barrel, the result is a pervasive transitive cycle:

```
index.ts → util → actions → index.ts
index.ts → ext  → index.ts
```

Node.js resolves cycles by returning partially-initialized modules, creating initialization-order fragility. The coupling also prevents unit-testing any action class in isolation without loading the entire barrel. Issue #201 addresses the same cycle from the `controller.ts` side; this issue addresses the action/UI side and provides the abstraction that makes the full cycle breakable.

## In scope

- **New file:** `src/model/interfaces.ts` defining:
  - `ILogger` — `trace`, `debug`, `error`, `printError` methods
  - `IConfiguration` — all public methods called by action/UI/logger modules, typed with model-only return types
  - `IParser` — `parseInput`, `resolveNotePathForInput`
  - `IWriter` — `createSaveLoadTextDocument`, `createEntryForPath`, `createWeeklyForPath`
  - `IReader` — `loadEntryForWeek`, `loadEntryForDate`
  - `IInject` — `injectInput`, `injectString`, `buildInlineString`, `injectInlineString`, `formatNote`
  - `IDialogues` — `getDateInput`, `getQuickPickInput`, `getUserInput`, `showDocument`
  - `JournalController` — composes the above sub-interfaces via named properties (`config`, `logger`, `parser`, `writer`, `reader`, `inject`, `ui`)
- **Type migration:** `EntryGranularity`, `NavigationMode`, `ScopeDefinitionLite` moved from `src/ext/conf.ts` to `src/model/` (re-exported from `src/ext/` for backward compat). Required because `model/interfaces.ts` must not import from `ext/` to avoid creating a new `model/ → ext/ → model/` cycle.
- **Updated:** `src/model/index.ts` — export new interfaces and migrated types
- **Updated:** `src/util/controller.ts` — add `implements JournalController`
- **Updated (barrel removal):** `src/actions/parser.ts`, `writer.ts`, `reader.ts`, `inject.ts`, `src/ext/dialogues.ts`, `src/util/logger.ts` — replace `constructor(public ctrl: J.Util.Ctrl)` with `constructor(public ctrl: JournalController)`, import `JournalController` from `../model`, remove `import * as J from '../.'` entirely

## Out of scope

- `src/provider/commands/*` and other provider files — they also use barrel imports and `Ctrl`; addressed as separate Phase 2.3 work
- `src/util/controller.ts` barrel removal (fixing its own `import * as J`) — that is #201's work
- No behavior changes; pure refactor of type dependencies

## Acceptance criteria

1. `src/model/interfaces.ts` exists and exports `JournalController`, `ILogger`, `IConfiguration`, `IParser`, `IWriter`, `IReader`, `IInject`, `IDialogues`
2. `Ctrl` in `controller.ts` has `implements JournalController` and TypeScript accepts it with no errors
3. None of the 6 updated modules (`parser.ts`, `writer.ts`, `reader.ts`, `inject.ts`, `dialogues.ts`, `logger.ts`) contain `import * as J from`
4. `npm run compile` passes with zero errors
5. `npm run lint` passes with zero new warnings
6. `npm test` passes with no regressions
7. No new barrel import (`import * as X from '...'`) introduced in updated files

## Entities / contracts

### `JournalController` (in `src/model/interfaces.ts`)

```typescript
export interface JournalController {
    config: IConfiguration;
    logger: ILogger;
    parser: IParser;
    writer: IWriter;
    reader: IReader;
    inject: IInject;
    ui: IDialogues;
}
```

### Key constraint: `model/interfaces.ts` imports only from `model/`

All method signatures on sub-interfaces must use types already in `src/model/` (e.g. `Input`, `ScopedTemplate`, `HeaderTemplate`, `InlineTemplate`, `EntryGranularity` after migration). No imports from `src/ext/` or `src/actions/` — that would recreate a cycle from the other direction.

### Types migrated from `src/ext/conf.ts` to `src/model/`

| Type | Used by `IConfiguration` method |
|---|---|
| `EntryGranularity = "daily" \| "weekly"` | `getEntryGranularity()` |
| `NavigationMode = 'existing' \| 'calendar'` | `getNavigationMode()` |
| `ScopeDefinitionLite { name?: string; base?: string; }` | `getScopeDefinitions()` |

`src/ext/conf.ts` re-exports these from `../model` after migration so existing imports in the codebase outside the updated files continue to compile without change.

### Constructor change in updated modules

```typescript
// Before
constructor(public ctrl: J.Util.Ctrl) { ... }

// After
import { JournalController } from '../model';
constructor(public ctrl: JournalController) { ... }
```

## Constraints

- TypeScript `strict` mode — interface must cover every property/method access on `ctrl` in each updated file; missing members cause compile errors
- `logger.ts` only needs `IConfiguration` sub-interface (specifically `isDevelopmentModeEnabled(): boolean`) — but the simplest fix is accepting `JournalController` in its constructor; no need for a narrower interface just for Logger
- Do not add `implements IParser` etc. to concrete classes — TypeScript structural typing satisfies the interface check without the keyword; explicit `implements` only on `Ctrl` → `JournalController`
- ESLint: import names must be `camelCase` or `PascalCase` — all interface/type names satisfy this

## Open questions

None.

## Related issues

- Related: #201 — fixes barrel import in `controller.ts` (complementary, independent track; together they complete Phase 2.3 for the core service layer)
- See `docs/PLAN.md` Phase 2.3 for broader named-imports roadmap
- See `docs/analysis/issue_dependency_disorder.md` for the original analysis
