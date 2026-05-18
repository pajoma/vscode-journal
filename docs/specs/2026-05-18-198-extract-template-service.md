# Spec: Extract TemplateService from Configuration (R1) — #198

## Goal
Move all template-resolution methods out of `src/vscode/conf.ts` into a dedicated `TemplateService` class while keeping `IConfiguration` and all callers unchanged.

## Why now
`conf.ts` is 945 lines and violates SRP: it mixes raw VS Code config access with template resolution (path building, inline template loading, date/variable substitution). Extracting `TemplateService` isolates the resolution logic, shrinks `Configuration` to a pure config accessor, and makes the resolution layer independently testable without a live VS Code workspace.

## In scope
- New class `TemplateService` in `src/vscode/template-service.ts`; takes a `Configuration` instance via constructor.
- Move all template-resolution public methods from `Configuration` to `TemplateService`:
  - Path resolution: `getResolvedEntryPath`, `getResolvedEntryPathForLocalOpen`, `getResolvedNotesPath`, `getResolvedWeeklyNotesPath`
  - File-pattern resolution: `getEntryFilePattern`, `getNotesFilePattern`, `getWeeklyNotesFilePattern`, `getWeekFilePattern`, `getWeekPathPattern`, `getWeekPathPatternForLocalOpen`
  - Header templates: `getEntryTemplate`, `getWeeklyTemplate`, `getNotesTemplate`
  - Inline templates: `getFileLinkInlineTemplate`, `getMemoInlineTemplate`, `getTaskInlineTemplate`, `getTimeStringTemplate`, `getDailyLinkInlineTemplate`
  - Sync string: `getTimeString`
- Move private helpers to `TemplateService`: `getInlineTemplate`, `getInlineTemplateCached` (deprecated), `resolveScope`
- `Configuration` implements `IConfiguration` by delegating the template methods to an internal `TemplateService` instance — no change to the interface or callers.
- `IConfiguration` interface stays byte-for-byte identical.
- All existing tests pass without modification.

## Out of scope
- Renaming or splitting `IConfiguration`.
- Migrating callers from `ctrl.config.getXxx()` to a separate `ctrl.templates` property.
- Adding new template variables or changing resolution logic.
- Any changes outside `src/vscode/conf.ts` and the new `src/vscode/template-service.ts`.

## Acceptance criteria
1. `src/vscode/template-service.ts` exists and contains all moved methods.
2. `src/vscode/conf.ts` no longer implements template-resolution logic directly — all such public methods delegate to an internal `TemplateService` instance.
3. `IConfiguration` in `src/model/interfaces.ts` is unchanged (no added, removed, or renamed members).
4. `npm run compile` succeeds with zero errors.
5. All existing tests pass without changing test assertions.
6. `conf.ts` line count drops by ≥ 350 lines (roughly the template-resolution block).

## Entities / contracts

### New class
```typescript
// src/vscode/template-service.ts
export class TemplateService {
    constructor(private readonly config: Configuration) {}

    // All moved public methods keep identical signatures
    async getResolvedEntryPath(date: Date, scopeId?: string): Promise<ScopedTemplate> { ... }
    // ... (same signatures as current Configuration methods)

    // Private helpers stay private
    private resolveScope(scopeId?: string): string { ... }
    private async getInlineTemplate(id: string, defaultValue: string, scopeId?: string): Promise<InlineTemplate> { ... }
}
```

### Delegation pattern in Configuration
```typescript
// src/vscode/conf.ts
export class Configuration implements IConfiguration {
    private readonly tpl: TemplateService = new TemplateService(this);

    public async getResolvedEntryPath(date: Date, scopeId?: string): Promise<ScopedTemplate> {
        return this.tpl.getResolvedEntryPath(date, scopeId);
    }
    // ... (same for all moved methods)
}
```

## Constraints
- `TemplateService` must NOT import `vscode` directly — it receives config data via the `Configuration` instance, which already wraps `vscode.WorkspaceConfiguration`.
- No behavior changes: every method must produce identical output before and after the move.
- `getInlineTemplateCached` is `@deprecated` and stays deprecated — move it as-is, do not clean it up in this PR.

## Open questions
None — design confirmed: internal-only refactor, interface unchanged.

## Related issues
- Blocks: #202 (test decoupling — TemplateService becomes independently mockable)
- Related: #211 (closed — already moved date-resolution functions to `template-engine.ts`; this PR builds on that cleanup)
