# Spec: Decouple Tests from Global VS Code Configuration State — #202

## Goal
Make `Configuration` and `Ctrl` constructible without a live `vscode.WorkspaceConfiguration`, so tests supply settings as plain objects rather than mutating VS Code's global workspace config.

## Why now
14 test files call `vscode.workspace.getConfiguration('journal')` and `config.update(…, ConfigurationTarget.Workspace)` to inject test values. This approach: (a) mutates global VS Code state, (b) is slow (each `update` is an async I/O write), and (c) creates test-order coupling — a test that crashes before teardown can leave dirty settings that break the next test. Must land after #198: once `TemplateService` lives behind `IRawConfigProvider`, the only remaining VS Code coupling in the resolution layer is the `Configuration` constructor seam. Fixing that seam makes both `TemplateService` and `Configuration` independently testable without the Extension Host.

## In scope
- New `IWorkspaceConfigReader` interface (two `get<T>` overloads only) in `src/model/interfaces.ts`
- `Configuration` constructor changed from `vscode.WorkspaceConfiguration` → `IWorkspaceConfigReader`
- `Ctrl` constructor changed from `vscode.WorkspaceConfiguration` → `IWorkspaceConfigReader` (structural subtype — production callers in `Startup` pass `vscode.WorkspaceConfiguration` unchanged)
- `FakeWorkspaceConfig` test double in `src/test/fake-workspace-config.ts`
- Refactor all 14 affected test files: replace `vscode.workspace.getConfiguration` + `config.update` setup with `new FakeWorkspaceConfig({ … })`
- Remove `ConfigurationTarget` imports from all test files

## Out of scope
- Writing new headless `TemplateService` unit tests (separate issue)
- Changes to `IConfiguration` interface
- Infrastructure seams / `IFileSystem` (#212)
- Further DI decomposition of `Ctrl` (#208)
- Any change to `Startup.ts` or production extension code

## Acceptance criteria
1. `IWorkspaceConfigReader` declared in `src/model/interfaces.ts`; `vscode.WorkspaceConfiguration` satisfies it structurally (no cast needed)
2. `Configuration` constructor signature: `constructor(raw: IWorkspaceConfigReader)`
3. `Ctrl` constructor signature: `constructor(configSource: IWorkspaceConfigReader)`
4. `FakeWorkspaceConfig` in `src/test/fake-workspace-config.ts`; constructor accepts `Record<string, unknown>`
5. Zero `vscode.workspace.getConfiguration` + `config.update` calls remain in any `src/test/suite/**` file
6. Zero `ConfigurationTarget` imports remain in any `src/test/suite/**` file
7. `npm run compile` exits 0, `npm test` passes (all existing tests green)

## Entities / contracts

### `IWorkspaceConfigReader` (new, `src/model/interfaces.ts`)
```typescript
export interface IWorkspaceConfigReader {
    get<T>(section: string): T | undefined;
    get<T>(section: string, defaultValue: T): T;
}
```
`vscode.WorkspaceConfiguration` satisfies this structurally. No cast needed in `Startup.ts`.

### `FakeWorkspaceConfig` (new, `src/test/fake-workspace-config.ts`)
```typescript
export class FakeWorkspaceConfig implements IWorkspaceConfigReader {
    constructor(private readonly settings: Record<string, unknown> = {}) {}
    get<T>(section: string, defaultValue?: T): T | undefined {
        return (section in this.settings ? this.settings[section] : defaultValue) as T | undefined;
    }
}
```

### `Configuration` constructor (changed, `src/vscode/conf.ts`)
```typescript
// Before: constructor(vscodeConfig: vscode.WorkspaceConfiguration)
// After:  constructor(private readonly config: IWorkspaceConfigReader)
```
Import `IWorkspaceConfigReader` from `../model`. Remove the `vscode.WorkspaceConfiguration` reference from this constructor.

### `Ctrl` constructor (changed, `src/util/controller.ts`)
```typescript
// Before: constructor(vscodeConfig: vscode.WorkspaceConfiguration)
// After:  constructor(configSource: IWorkspaceConfigReader)
```

### Test setup pattern (changed in all 14 test files)
```typescript
// Before
const config = vscode.workspace.getConfiguration('journal');
await config.update('base', tmpBase, vscode.ConfigurationTarget.Workspace);
const refreshed = vscode.workspace.getConfiguration('journal');
const ctrl = new J.Util.Ctrl(refreshed);

// After
const ctrl = new J.Util.Ctrl(new FakeWorkspaceConfig({ base: tmpBase }));
```

## Affected test files (14)
`commands-inject.test.ts`, `week-input.test.ts`, `notes-sync.test.ts`,
`issue-168-entry-granularity.test.ts`, `commands-entry.test.ts`, `phase1-regression.test.ts`,
`commands-prev-next.test.ts`, `read-templates.test.ts`, `issue-185-weekly-sync.test.ts`,
`input.test.ts`, `commands-note.test.ts`, `issue-51-remote-create.test.ts`,
`commands-weekly.test.ts`, `scan-entries-cache.test.ts`

## Open questions
None.

## Related issues
- **Blocked by #198** (extract TemplateService — `IRawConfigProvider` seam must land first; #202 then completes the test isolation story)
- Related to #212 (infrastructure seams / `IFileSystem`)
- Related to #208 (constructor injection)
