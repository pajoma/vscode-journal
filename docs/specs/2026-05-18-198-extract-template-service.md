# Spec: Extract TemplateService from Configuration (R1) — #198

## Goal
Move all template-resolution methods out of `src/vscode/conf.ts` into a dedicated `TemplateService` class while keeping `IConfiguration` and all callers unchanged.

## Why now
`conf.ts` is 945 lines and violates SRP: it mixes raw VS Code config access with template resolution (path building, inline template loading, date/variable substitution). Extracting `TemplateService` isolates the resolution logic, shrinks `Configuration` to a pure config accessor, and makes the resolution layer independently testable without a live VS Code workspace.

## In scope
- New interface `IRawConfigProvider` exported from `src/vscode/template-service.ts` — the narrow contract `TemplateService` depends on (data-only; no VS Code types).
- New class `TemplateService` in `src/vscode/template-service.ts`; takes `IRawConfigProvider` in its constructor.
- Move all template-resolution public methods from `Configuration` to `TemplateService`:
  - Path resolution: `getResolvedEntryPath`, `getResolvedEntryPathForLocalOpen`, `getResolvedNotesPath`, `getResolvedWeeklyNotesPath`
  - File-pattern resolution: `getEntryFilePattern`, `getNotesFilePattern`, `getWeeklyNotesFilePattern`, `getWeekFilePattern`, `getWeekPathPattern`, `getWeekPathPatternForLocalOpen`
  - Header templates: `getEntryTemplate`, `getWeeklyTemplate`, `getNotesTemplate`
  - Inline templates: `getFileLinkInlineTemplate`, `getMemoInlineTemplate`, `getTaskInlineTemplate`, `getTimeStringTemplate`, `getDailyLinkInlineTemplate`
  - Sync string: `getTimeString`
- Private helpers move to `TemplateService`: `resolveScope` (1-line, duplicated rather than exposed on the interface), `getInlineTemplateCached` (deprecated, moved as-is).
- Private `getInlineTemplate` refactored: its VS Code config–reading logic becomes `loadInlineTemplate` on `IRawConfigProvider`; `TemplateService` calls `this.raw.loadInlineTemplate(...)` instead of reading config directly — no `vscode` import in `TemplateService`.
- `Configuration` implements `IRawConfigProvider`: adds public `loadInlineTemplate(id, defaultValue, scopeId?)` (renamed from private `getInlineTemplate`), exposes the existing data-getter methods already on `IConfiguration`, and holds `private readonly tpl: TemplateService = new TemplateService(this)`.
- `Configuration` delegates all moved public methods to `this.tpl` — single-line wrappers.
- `IConfiguration` in `src/model/interfaces.ts` is byte-for-byte identical (no callers change).
- All existing tests pass without modification.

## Out of scope
- Renaming or splitting `IConfiguration`.
- Migrating callers from `ctrl.config.getXxx()` to a separate `ctrl.templates` property (future work).
- Adding new template variables or changing resolution logic.
- Cleaning up `getInlineTemplateCached` (deprecated but stays as-is).

## Acceptance criteria
1. `src/vscode/template-service.ts` exists; exports `IRawConfigProvider` and `TemplateService`.
2. `TemplateService` does not import `vscode` anywhere.
3. `src/vscode/conf.ts` contains zero template-resolution logic directly — all such public methods are 1-line delegation wrappers.
4. `Configuration` implements `IRawConfigProvider`: `loadInlineTemplate` is public, all other required data getters already exist.
5. No circular file dependency: `template-service.ts` does NOT import from `conf.ts`.
6. `IConfiguration` in `src/model/interfaces.ts` is unchanged.
7. `npm run compile` succeeds with zero errors.
8. All existing tests pass without changing test assertions.
9. `conf.ts` drops ≥ 350 lines.

## Entities / contracts

### IRawConfigProvider (new, in template-service.ts)
```typescript
export interface IRawConfigProvider {
    getLocale(): string;
    getBasePath(scopeId?: string): string;
    getBasePathForLocalOpen(scopeId?: string): string;
    getFileExtension(scopeId?: string): string;
    getNotesPathPattern(scopeId?: string): string | undefined;
    getWeeklyNotesPathPattern(scopeId?: string): string;
    getEntryPathPattern(scopeId?: string): string;
    getWeeksPathPatternRaw(scopeId?: string): string;
    getWeeksFilePatternRaw(scopeId?: string): string;
    loadInlineTemplate(id: string, defaultValue: string, scopeId?: string): Promise<InlineTemplate>;
}
```

### TemplateService (new, in template-service.ts)
```typescript
export class TemplateService {
    constructor(private readonly raw: IRawConfigProvider) {}

    // Identical public signatures to current Configuration methods
    async getResolvedEntryPath(date: Date, scopeId?: string): Promise<ScopedTemplate> { ... }
    // ... all moved methods

    private resolveScope(scopeId?: string): string { ... }  // 1-line, no export needed
    // getInlineTemplateCached stays private, deprecated
}
```

### Delegation pattern in Configuration
```typescript
export class Configuration implements IConfiguration, IRawConfigProvider {
    private readonly tpl: TemplateService = new TemplateService(this);

    // NEW public method (was private getInlineTemplate) — satisfies IRawConfigProvider
    public async loadInlineTemplate(id: string, defaultValue: string, scopeId?: string): Promise<InlineTemplate> {
        // existing body of private getInlineTemplate, unchanged
    }

    // Delegation wrappers (replace current implementation bodies)
    public async getResolvedEntryPath(date: Date, scopeId?: string): Promise<ScopedTemplate> {
        return this.tpl.getResolvedEntryPath(date, scopeId);
    }
    // ... same for all moved methods
}
```

## Dependency graph (no cycle)
```
template-service.ts  ←  conf.ts
  exports IRawConfigProvider
  exports TemplateService
  does NOT import conf.ts
```

## Constraints
- `TemplateService` must not import `vscode` (verified by acceptance criterion 2).
- `getInlineTemplateCached` is `@deprecated` — move as-is, no cleanup.
- No behavior changes: every method must produce identical output before and after.

## Open questions
None — design confirmed with interface boundary added per review.

## Related issues
- Blocks: #202 (test decoupling — `TemplateService` with `IRawConfigProvider` can be tested with a plain mock object)
- Related: #211 (closed — extracted date functions to `template-engine.ts`; this builds on that)
