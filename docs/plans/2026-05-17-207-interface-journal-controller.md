---
issue: "#207"
date: 2026-05-17
slug: 207-interface-journal-controller
spec: docs/specs/2026-05-17-207-interface-journal-controller.md
---

# Plan: Break circular coupling via `JournalController` interface extraction (#207)

## Approach

Introduce `JournalController` (and seven sub-interfaces) in `src/model/interfaces.ts` so action/UI modules can type their `ctrl` parameter without importing the concrete `Ctrl` class via the root barrel. Three configuration types (`EntryGranularity`, `NavigationMode`, `ScopeDefinitionLite`) are moved to `src/model/config.ts` first because `interfaces.ts` must not import from `ext/` — doing so recreates the cycle from the opposite direction.

Main trade-off: this adds seven new interfaces to maintain alongside their concrete implementations. The upside is that TypeScript validates interface coverage at compile time (`Ctrl implements JournalController`), so drift is caught immediately.

## Steps

### Step 1 — Migrate three types from `src/ext/conf.ts` to `src/model/config.ts`

**Why:** `IConfiguration` in `model/interfaces.ts` needs these types in method signatures. If they stay in `ext/conf.ts`, `interfaces.ts` would need to import from `ext/` → `model/ → ext/` cycle.

Move these three declarations verbatim from `ext/conf.ts` to `src/model/config.ts`:

```typescript
export type EntryGranularity = "daily" | "weekly";
export type NavigationMode = 'existing' | 'calendar';
export interface ScopeDefinitionLite { name?: string; base?: string; }
```

Add re-export in `ext/conf.ts` so existing callers outside the six updated modules compile without change:

```typescript
export { EntryGranularity, NavigationMode, ScopeDefinitionLite } from '../model/config';
```

Add to `src/model/index.ts`:

```typescript
export { EntryGranularity, NavigationMode, ScopeDefinitionLite } from './config';
```

### Step 2 — Create `src/model/interfaces.ts`

**Why:** Central home for the abstraction. Imports only from `./config` and `./input` (both already in `model/`) — no cross-layer imports.

Full content:

```typescript
import { EntryGranularity, HeaderTemplate, InlineTemplate, ScopedTemplate } from './config';
import { Input, InlineString } from './input';

export interface ILogger {
    trace(message: string, ...params: unknown[]): void;
    debug(message: string, ...params: unknown[]): void;
    error(message: string, ...params: unknown[]): void;
    printError(error: Error): void;
}

export interface IConfiguration {
    getLocale(): string;
    getScopes(): string[];
    getBasePath(scopeId?: string): string;
    getEntryGranularity(scopeId?: string): EntryGranularity;
    getEntryPathPattern(scopeId?: string): string;
    getNotesPathPattern(scopeId?: string): string;
    getInputDetailsTimeFormat(): string[];
    getInputTimeThreshold(): number;
    isOpenInNewEditorGroup(): boolean;
    isDevelopmentModeEnabled(): boolean;
    getResolvedEntryPath(date: Date, scopeId?: string): Promise<ScopedTemplate>;
    getEntryFilePattern(date: Date, scopeId?: string): Promise<ScopedTemplate>;
    getResolvedNotesPath(date: Date, scopeId?: string): Promise<ScopedTemplate>;
    getNotesFilePattern(date: Date, input: string, scopeId?: string): Promise<ScopedTemplate>;
    getResolvedWeeklyNotesPath(week: number, year: number, scopeId?: string): Promise<ScopedTemplate>;
    getWeeklyNotesFilePattern(week: number, year: number, input: string, scopeId?: string): Promise<ScopedTemplate>;
    getWeekPathPattern(week: number, scopeId?: string): Promise<ScopedTemplate>;
    getWeekFilePattern(week: number, scopeId?: string): Promise<ScopedTemplate>;
    getEntryTemplate(date: Date, scopeId?: string): Promise<HeaderTemplate>;
    getWeeklyTemplate(week: number, scopeId?: string): Promise<ScopedTemplate>;
    getNotesTemplate(scopeId?: string): Promise<HeaderTemplate>;
    getMemoInlineTemplate(scopeId?: string): Promise<InlineTemplate>;
    getTaskInlineTemplate(scopeId?: string): Promise<InlineTemplate>;
}

export interface IParser {
    parseInput(inputString: string): Promise<Input>;
    resolveNotePathForInput(input: Input, scopeId?: string): Promise<string>;
}

export interface IWriter {
    createEntryForPath(path: ScopedTemplate, date: Date): Promise<ScopedTemplate>;
    createWeeklyForPath(path: ScopedTemplate, week: number): Promise<ScopedTemplate>;
    createSaveLoadTextDocument(path: string, content: string): Promise<import('vscode').TextDocument>;
}

export interface IReader {
    loadEntryForInput(input: Input): Promise<import('vscode').TextDocument>;
    loadEntryForWeek(week: number, scope?: string): Promise<import('vscode').TextDocument>;
    loadEntryForDate(date: Date, scope?: string): Promise<import('vscode').TextDocument>;
}

export interface IInject {
    injectInput(doc: import('vscode').TextDocument, input: Input): Promise<import('vscode').TextDocument>;
    injectString(doc: import('vscode').TextDocument, content: InlineString, pos: import('vscode').Position): Promise<import('vscode').TextDocument>;
    buildInlineString(doc: import('vscode').TextDocument, tpl: InlineTemplate, ...values: string[][]): Promise<InlineString>;
    injectInlineString(content: InlineString, ...other: InlineString[]): Promise<import('vscode').TextDocument>;
    formatNote(input: Input): Promise<string>;
}

export interface IDialogues {
    getUserInputWithValidation(): Promise<Input>;
    getDateInput(): Promise<Input>;
    pickItem(type: number): Promise<Input>;
    showDocument(doc: import('vscode').TextDocument): Promise<void>;
}

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

Note: `vscode.TextDocument`, `vscode.Position` are referenced inline via `import('vscode')` to avoid adding a top-level `import * as vscode` that would re-introduce a dependency issue, OR add `import type * as vscode from 'vscode'` at the top — both work since `vscode` is an external (not part of the barrel cycle).

Add to `src/model/index.ts`:

```typescript
export {
    ILogger, IConfiguration, IParser, IWriter, IReader, IInject, IDialogues,
    JournalController
} from './interfaces';
```

### Step 3 — `src/util/controller.ts`: add `implements JournalController`

**Why:** Compiler validates that `Ctrl` satisfies the interface. Any missing or mismatched getter surfaces immediately.

```typescript
import { JournalController } from '../model';
// ...
export class Ctrl implements JournalController {
```

No other changes to `controller.ts` in this issue (barrel removal is #201).

### Step 4 — `src/util/logger.ts`: remove barrel

**Why:** Logger only uses `ctrl.config.isDevelopmentModeEnabled()` from `Ctrl`, plus three util helpers from the barrel.

Replacements:

| Remove | Add |
|---|---|
| `import * as J from '../.'` | `import { JournalController } from '../model'` |
| | `import { isString, isError, isNotNullOrUndefined } from './util'` |
| | `import { isNotNullOrUndefined } from './strings'` (if `isString` is there) |
| `J.Util.Ctrl` in constructor | `JournalController` |
| `J.Util.isString(msg)` | `isString(msg)` |
| `J.Util.isError(msg)` | `isError(msg)` |
| `J.Util.isNotNullOrUndefined(...)` | `isNotNullOrUndefined(...)` |

`isString` is in `./strings`, `isError` and `isNotNullOrUndefined` are in `./util`. Import from each directly.

### Step 5 — `src/actions/writer.ts`: remove barrel

**Why:** Writer only uses `J.Util.Ctrl` in the constructor — simplest change in the set.

| Remove | Add |
|---|---|
| `import * as J from '../.'` | `import { JournalController } from '../model'` |
| `J.Util.Ctrl` in constructor | `JournalController` |

### Step 6 — `src/actions/inject.ts`: remove barrel

**Why:** Inject uses model types (`Input`, `InlineTemplate`, `InlineString`, `HeaderTemplate`) and `Ctrl`; all replaceable with direct model imports.

| Remove | Add |
|---|---|
| `import * as J from '../.'` | `import { JournalController, Input, InlineTemplate, InlineString, HeaderTemplate } from '../model'` |
| `J.Model.Input`, `J.Model.InlineTemplate`, etc. | bare names |
| `J.Util.Ctrl` in constructor | `JournalController` |

### Step 7 — `src/actions/reader.ts`: remove barrel

**Why:** Reader uses `Input`, `resolvePath`, `fileExists` plus `Ctrl`.

| Remove | Add |
|---|---|
| `import * as J from '..'` | `import { JournalController, Input } from '../model'` |
| | `import { resolvePath, fileExists } from '../util'` |
| `J.Model.Input` | `Input` |
| `J.Util.resolvePath(...)` | `resolvePath(...)` |
| `J.Util.fileExists(...)` | `fileExists(...)` |
| `J.Util.Ctrl` in constructor | `JournalController` |

### Step 8 — `src/actions/parser.ts`: remove barrel

**Why:** Parser uses the most util helpers; all are re-exported from `'../util'` sub-barrel which has no cycle.

| Remove | Add |
|---|---|
| `import * as J from '../.'` | `import { JournalController, Input } from '../model'` |
| | `import { isNotNullOrUndefined, normalizeFilename, getCurrentISOWeek, getISOWeekYear } from '../util'` |
| `J.Model.Input` | `Input` |
| `J.Util.*` helpers | bare names |
| `J.Util.Ctrl` in constructor | `JournalController` |

### Step 9 — `src/ext/dialogues.ts`: remove barrel

**Why:** Dialogues uses `Input`, `JournalPageType`, `isNotNullOrUndefined`, and `DecoratedQuickPickItem`. The latter must be imported directly from `'../provider/features/scan-entries'` — not via the provider barrel — to avoid pulling in the provider index which re-triggers the cycle via `scan-entries → ext/` barrel.

| Remove | Add |
|---|---|
| `import * as J from '..'` | `import { JournalController, Input, JournalPageType } from '../model'` |
| | `import { isNotNullOrUndefined } from '../util'` |
| | `import { DecoratedQuickPickItem } from '../provider/features/scan-entries'` |
| `J.Model.Input`, `J.Model.JournalPageType` | bare names |
| `J.Util.isNotNullOrUndefined(...)` | `isNotNullOrUndefined(...)` |
| `J.Provider.DecoratedQuickPickItem` | `DecoratedQuickPickItem` |
| `J.Util.Ctrl` in constructor | `JournalController` |

### Step 10 — Verify

```bash
npm run compile   # must produce zero errors
npm run lint      # must produce zero new warnings
npm test          # must pass with no regressions
grep -rn "import \* as J" src/util/logger.ts src/actions/ src/ext/dialogues.ts  # must produce no output
```

## Test scenarios

**T1 — Compile-time interface coverage (unit: TypeScript)**
`npm run compile` passes. If any `ctrl.*` call in the six files is not covered by `JournalController`/sub-interfaces, tsc reports a type error before any test runs.

**T2 — `Ctrl` satisfies `JournalController` (unit: TypeScript)**
`Ctrl implements JournalController` in `controller.ts` — tsc validates all getters return the right sub-interface types. Any gap (e.g. missing `ui` getter or wrong return type) is a compile error.

**T3 — No regressions in full test suite (integration)**
`npm test` passes green. Existing tests exercise the happy path for all six modules through the real Extension Host — confirms structural compatibility at runtime.

**T4 — Barrel-free audit (static)**
`grep -rn "import \* as J" src/util/logger.ts src/actions/ src/ext/dialogues.ts` returns no output. Enforces the acceptance criterion without running tests.

**T5 — `ext/conf.ts` still compiles after type migration (unit: TypeScript)**
Callers of `EntryGranularity`, `NavigationMode`, `ScopeDefinitionLite` outside the six files (e.g. `src/provider/`) still compile because `ext/conf.ts` re-exports them from `../model/config`.

## Dependencies

- No other PRs or branches must land first.
- #201 is a parallel track (fixes `controller.ts` barrel). Implementations are independent; they can merge in either order.

## Risk

| Risk | Coverage |
|---|---|
| `IConfiguration` missing a method → `Ctrl implements JournalController` breaks at compile | T1, T2 |
| `IWriter`/`IReader` return types don't match concrete class → tsc error | T2 |
| `scan-entries.ts` import in `dialogues.ts` reintroduces `ext/` barrel cycle | T3 (runtime), T4 (static): only direct file import used, not provider index |
| `conf.ts` callers of migrated types outside six files break | T5 |
| Runtime behavior change | T3 — no behavior change; pure type-level refactor |

## Rollback

`git revert <commit>` — pure refactor, no data migrations, no API surface changes. Re-introduces barrel imports but does not break functionality.

## Reference spec

[docs/specs/2026-05-17-207-interface-journal-controller.md](../specs/2026-05-17-207-interface-journal-controller.md)
