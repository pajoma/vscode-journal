# Plan: Extract TemplateService from Configuration (R1) — #198

## Reference spec
[docs/specs/2026-05-18-198-extract-template-service.md](../specs/2026-05-18-198-extract-template-service.md)

## Approach
Pure Extract Class refactor. Create `src/vscode/template-service.ts` that exports `IRawConfigProvider` (interface) and `TemplateService` (class). Move all resolution logic there. Add the raw getters `Configuration` must expose to satisfy `IRawConfigProvider`. Replace each moved method body in `Configuration` with a one-line delegation call. Zero changes to `IConfiguration`, zero changes to callers.

Trade-off: `IRawConfigProvider` grows to 14 methods — wider than ideal — but each maps to an existing or trivially-extractable getter on `Configuration`. The alternative (pure functions receiving bare strings) would require caller changes, which is out of scope.

## Steps

### 1 — Audit the direct `this.config.get` calls in methods being moved
Six methods read `vscode.WorkspaceConfiguration` directly and cannot be moved verbatim without leaking VS Code into `TemplateService`. Extract their lookup logic into new raw getters on `Configuration`:

| Method being moved | Config read (default / scoped) | New raw getter on Configuration |
|---|---|---|
| `getNotesFilePattern` | `patterns.notes.file` / scoped `notes.file` | `getNotesFilePatternRaw(scopeId?)` |
| `getWeeklyNotesFilePattern` | `patterns.weeklyNotes.file` / scoped | `getWeeklyNotesFilePatternRaw(scopeId?)` |
| `getEntryFilePattern` | `patterns.entries.file` / scoped | `getEntryFilePatternRaw(scopeId?)` |
| `getWeekFilePattern` | `weeks.file` (default) / `notes.file` (scoped) ← existing behavior | `getWeekFilePatternRaw(scopeId?)` |
| `getWeekPathPattern` / `getWeekPathPatternForLocalOpen` | `weeks.path` (default) / `entries.path` (scoped) ← existing behavior | `getWeekOrEntryPathPatternRaw(scopeId?)` |

Why first: all subsequent steps depend on these getters existing on `Configuration`.

### 2 — Add raw getters to `Configuration` (conf.ts only)
Add five new public methods implementing the lookup logic extracted in step 1. Each follows the same pattern as the existing `getWeeksPathPatternRaw` / `getWeeksFilePatternRaw`:

```typescript
public getEntryFilePatternRaw(scopeId?: string): string {
    const scope = this.resolveScope(scopeId);
    let result = scope === SCOPE_DEFAULT
        ? this.config.get<PatternDefinition>("patterns")?.entries?.file
        : this.config.get<ScopeDefinition[]>("scopes")?.find(sd => sd.name === scope)?.patterns?.entries?.file;
    return (isNullOrUndefined(result) || result!.length === 0) ? defaultPatternDefinition.entries.file : result!;
}
// getNotesFilePatternRaw, getWeeklyNotesFilePatternRaw, getWeekFilePatternRaw, getWeekOrEntryPathPatternRaw — same structure
```

`getWeekFilePatternRaw` and `getWeekOrEntryPathPatternRaw` must reproduce the existing asymmetric scoped lookup (notes.file / entries.path) to preserve behavior.

Also rename private `getInlineTemplate` → `public loadInlineTemplate` (same body; only visibility and name change). The `@deprecated getInlineTemplateCached` stays private and is NOT renamed.

Why: `IRawConfigProvider` requires all these as public methods.

### 3 — Create `src/vscode/template-service.ts`

New file. Structure:

```typescript
import * as os from 'os';
import * as Path from 'path';
import { HeaderTemplate, InlineTemplate, ScopedTemplate, SCOPE_DEFAULT } from '../model';
import { replaceVariableValue, isNullOrUndefined } from '../util';
import { resolveDate } from '../journal/template-engine';
import { Util } from '..';

export interface IRawConfigProvider {
    getLocale(): string;
    getBasePath(scopeId?: string): string;
    getBasePathForLocalOpen(scopeId?: string): string;
    getFileExtension(scopeId?: string): string;
    getEntryPathPattern(scopeId?: string): string;
    getNotesPathPattern(scopeId?: string): string | undefined;
    getWeeklyNotesPathPattern(scopeId?: string): string;
    getWeeksPathPatternRaw(scopeId?: string): string;
    getWeeksFilePatternRaw(scopeId?: string): string;
    getEntryFilePatternRaw(scopeId?: string): string;
    getNotesFilePatternRaw(scopeId?: string): string;
    getWeeklyNotesFilePatternRaw(scopeId?: string): string;
    getWeekFilePatternRaw(scopeId?: string): string;
    getWeekOrEntryPathPatternRaw(scopeId?: string): string;
    loadInlineTemplate(id: string, defaultValue: string, scopeId?: string): Promise<InlineTemplate>;
}

export class TemplateService {
    constructor(private readonly raw: IRawConfigProvider) {}

    // All moved public methods (bodies copied verbatim from Configuration,
    // replacing `this.` with `this.raw.` for config calls,
    // keeping `os.homedir()`, `Path.normalize()`, `resolveDate()`, `replaceVariableValue()`)

    private resolveScope(scopeId?: string): string {
        return (isNullOrUndefined(scopeId) || scopeId!.length === 0) ? SCOPE_DEFAULT : scopeId!;
    }
}
```

No `import * as vscode` anywhere in this file.

Why: this is the core extraction. All resolution logic lives here after this step.

### 4 — Add `IRawConfigProvider` to `Configuration`'s implements clause (conf.ts)
```typescript
export class Configuration implements IConfiguration, IRawConfigProvider {
    private readonly tpl: TemplateService = new TemplateService(this);
    // ...
}
```

Import `TemplateService` and `IRawConfigProvider` from `./template-service`.

Why: makes TypeScript enforce that `Configuration` satisfies the interface. Compiler errors reveal any missing methods.

### 5 — Replace moved method bodies in `Configuration` with delegation wrappers
For every method moved to `TemplateService`, replace the body with a one-liner:

```typescript
public async getResolvedEntryPath(date: Date, scopeId?: string): Promise<ScopedTemplate> {
    return this.tpl.getResolvedEntryPath(date, scopeId);
}
// ... repeat for all ~18 moved methods
```

Also remove `private resolveScope` from `Configuration` **only if** no non-moved methods still call it. Audit: `getBasePath`, `getBasePathForLocalOpen`, `isWindowsStyleBaseConfigured`, `getFileExtension`, `getNotesPathPattern`, `getWeeklyNotesPathPattern`, `getWeeksPathPatternRaw`, `getWeeksFilePatternRaw`, `getEntryPathPattern`, `getEntryGranularity`, `getEntryFilePatternRaw`, `getNotesFilePatternRaw`, `getWeeklyNotesFilePatternRaw`, `getWeekFilePatternRaw`, `getWeekOrEntryPathPatternRaw` — most of these call `this.resolveScope(...)`. Keep `resolveScope` private in `Configuration`.

Why: after this step `conf.ts` contains zero resolution logic; every non-raw public method is a delegation wrapper.

### 6 — Verify no `vscode` import in template-service.ts
Run:
```bash
grep -n "vscode" src/vscode/template-service.ts
```
Must return zero matches.

### 7 — Compile and run tests
```bash
npm run compile
npm test
```
Both must pass with zero errors/failures.

## Test scenarios

**T1 — No circular import**
`grep -rn "from.*conf" src/vscode/template-service.ts` → zero results.

**T2 — No vscode in TemplateService**
`grep -n "vscode" src/vscode/template-service.ts` → zero results.

**T3 — IConfiguration unchanged**
`git diff src/model/interfaces.ts` → zero changes.

**T4 — conf.ts shrinks**
`wc -l src/vscode/conf.ts` → ≤ 595 lines (current 945 − ≥ 350).

**T5 — Delegation only**
Every public method in the moved list has a body of exactly one `return this.tpl.xxx(...)` statement (no logic).

**T6 — Compile clean**
`npm run compile` → exit 0, zero errors.

**T7 — Existing tests pass unchanged**
`npm test` → all tests green, no test file modified.

**T8 — Scoped week pattern preserved**
`getWeekFilePattern` called with a scopeId falls back to `notes.file` (not `weeks.file`) — same as current behavior. Covered by existing scope tests or verified manually.

## Dependencies
- `feat-211` (closed, merged) — `resolveDate` from `template-engine.ts` is already in place; this plan depends on it.

## Risk
**Risk:** The five new raw getters on `Configuration` must reproduce exact lookup logic (including the asymmetric scoped fallbacks in `getWeekFilePatternRaw`/`getWeekOrEntryPathPatternRaw`). A mis-transcription silently changes behavior.  
**Mitigation:** T8 (scoped week pattern) catches the most likely divergence. Step 1 explicitly calls out which methods have asymmetric scoped lookups.

**Risk:** `resolveScope` needed by both `Configuration` (for the remaining raw getters) and `TemplateService`. Removing it from one side breaks the build.  
**Mitigation:** Step 5 explicitly audits before removing. Keep it private in both classes.

## Rollback
`git revert <merge-commit>` — no schema, no migration, no data. Pure TypeScript move.
