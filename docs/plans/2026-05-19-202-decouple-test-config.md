# Plan: Decouple Tests from Global VS Code Configuration State — #202

## Reference spec
[docs/specs/2026-05-19-202-decouple-test-config.md](../specs/2026-05-19-202-decouple-test-config.md)

## Approach
Introduce a thin `IWorkspaceConfigReader` interface (single `get<T>` overload pair) so `Configuration` and `Ctrl` can be constructed with a plain object instead of `vscode.WorkspaceConfiguration`. Add `FakeWorkspaceConfig` test double. Refactor 14 test files to build `Ctrl` from `FakeWorkspaceConfig({…})` and delete all `original*` state variables + `afterEach` blocks that only reset config state.

Trade-off: `FakeWorkspaceConfig` is a flat dictionary lookup. `Configuration` exclusively reads top-level keys (confirmed: `base`, `locale`, `ext`, `scopes`, `patterns`, `templates`, `weeklySync`, `navigation.mode`, `dev`, `openInNewEditorGroup`, `syntax-highlighting`, `entryGranularity`, `tpl-*`) — no nested path reads — so flat lookup is safe and no special path parser is needed.

## Steps

### 1 — Add `IWorkspaceConfigReader` to `src/model/interfaces.ts`

Add after the existing interface declarations:

```typescript
export interface IWorkspaceConfigReader {
    get<T>(section: string): T | undefined;
    get<T>(section: string, defaultValue: T): T;
}
```

**Why first:** `Configuration` and `Ctrl` import from `../model`; the interface must exist before their constructors are changed. `vscode.WorkspaceConfiguration` satisfies this structurally — TypeScript confirms at compile time that no cast is needed in `Startup.ts`.

### 2 — Update `Configuration` constructor (`src/vscode/conf.ts`)

Change constructor signature:
```typescript
// Before
constructor(vscodeConfig: vscode.WorkspaceConfiguration) {
    this._config = vscodeConfig;
}
// After
import { IWorkspaceConfigReader } from '../model';
constructor(private readonly config: IWorkspaceConfigReader) {}
```

Note: the field is already named `config` throughout `conf.ts` — only the type annotation changes. Remove `vscode.WorkspaceConfiguration` from the constructor parameter type; keep all `this.config.get<…>(…)` call sites unchanged.

**Why:** This is the primary seam. After this change, `Configuration` no longer depends on a VS Code API type.

### 3 — Update `Ctrl` constructor (`src/util/controller.ts`)

```typescript
// Before
constructor(vscodeConfig: vscode.WorkspaceConfiguration) {
    this._config = new Configuration(vscodeConfig);
}
// After
import { IWorkspaceConfigReader } from '../model';
constructor(configSource: IWorkspaceConfigReader) {
    this._config = new Configuration(configSource);
}
```

**Why:** `Ctrl` is the entry point tests use. Changing its constructor to `IWorkspaceConfigReader` lets tests pass `new FakeWorkspaceConfig(…)` directly.

### 4 — Verify `npm run compile` (structural typing gate)

```bash
npm run compile
```

Must exit 0. If `Startup.ts` passes `vscode.workspace.getConfiguration('journal')` to `new Ctrl(…)`, TypeScript will silently accept it — `vscode.WorkspaceConfiguration` structurally satisfies `IWorkspaceConfigReader`. Zero changes expected in `Startup.ts`. Any compile error at this step means `IWorkspaceConfigReader` is missing a method that `Configuration` calls on `this.config`.

### 5 — Create `FakeWorkspaceConfig` (`src/test/fake-workspace-config.ts`)

```typescript
import { IWorkspaceConfigReader } from '../model';

export class FakeWorkspaceConfig implements IWorkspaceConfigReader {
    constructor(private readonly settings: Record<string, unknown> = {}) {}

    get<T>(section: string, defaultValue?: T): T | undefined {
        return (section in this.settings
            ? this.settings[section]
            : defaultValue) as T | undefined;
    }
}
```

**Why:** Single implementation used by all 14 test files. Constructor accepts a plain object — tests declare their needed settings inline with no async I/O.

### 6 — Refactor all 14 test files

For each file listed below, apply the same mechanical change:

**Pattern A — module-level `beforeEach` with single `ctrl` per suite:**
```typescript
// Before (in beforeEach / before)
const config = vscode.workspace.getConfiguration('journal');
await config.update('base', tmpBase, vscode.ConfigurationTarget.Workspace);
const refreshed = vscode.workspace.getConfiguration('journal');
ctrl = new J.Util.Ctrl(refreshed);

// After
ctrl = new J.Util.Ctrl(new FakeWorkspaceConfig({ base: tmpBase }));
```

**Pattern B — per-describe `beforeEach` with `original*` save/restore:**
```typescript
// Before
let originalBase: string | undefined;
beforeEach(async () => {
    const config = vscode.workspace.getConfiguration('journal');
    originalBase = config.get<string>('base');
    await config.update('base', tmpBase, vscode.ConfigurationTarget.Workspace);
    ctrl = new J.Util.Ctrl(vscode.workspace.getConfiguration('journal'));
});
afterEach(async () => {
    await config.update('base', originalBase, vscode.ConfigurationTarget.Workspace);
});

// After
beforeEach(() => {
    ctrl = new J.Util.Ctrl(new FakeWorkspaceConfig({ base: tmpBase }));
});
// afterEach DELETED (no global state to restore)
// originalBase variable DELETED
```

**Caution for `commands-prev-next.test.ts`:** some `afterEach` blocks also restore `vscode.window.showInformationMessage`. Keep those restores — only remove the `config.update` lines and the `original*` config variables.

**Files to refactor:**
1. `commands-inject.test.ts`
2. `week-input.test.ts`
3. `notes-sync.test.ts`
4. `issue-168-entry-granularity.test.ts`
5. `commands-entry.test.ts`
6. `phase1-regression.test.ts`
7. `commands-prev-next.test.ts`
8. `read-templates.test.ts`
9. `issue-185-weekly-sync.test.ts`
10. `input.test.ts`
11. `commands-note.test.ts`
12. `issue-51-remote-create.test.ts`
13. `commands-weekly.test.ts`
14. `scan-entries-cache.test.ts`

For each file, also remove any `import … ConfigurationTarget` from the VS Code import once all uses are gone.

### 7 — Verify `npm run compile-tests` and `npm test`

```bash
npm run compile-tests   # tsc — catches type errors in refactored tests
npm test                # full suite — confirms all 14 suites pass
```

Both must exit 0 with zero errors.

## Test scenarios

**T1 — Interface satisfies structurally**
`npx tsc --noEmit` on `src/vscode/startup.ts` without changing it → zero errors. Proves `vscode.WorkspaceConfiguration` satisfies `IWorkspaceConfigReader`.

**T2 — FakeWorkspaceConfig key lookup**
`new FakeWorkspaceConfig({ base: '/tmp/x' }).get('base')` returns `'/tmp/x'`.
`new FakeWorkspaceConfig({}).get('base', 'fallback')` returns `'fallback'`.
Verifiable in `node -e` without VS Code.

**T3 — No live config mutation in tests**
`grep -rn "config\.update\|ConfigurationTarget" src/test/suite/` → zero results.

**T4 — No getConfiguration in tests**
`grep -rn "vscode\.workspace\.getConfiguration" src/test/suite/` → zero results.

**T5 — No dead original\* variables**
`grep -rn "originalBase\|originalScopes\|originalMode\|originalExt" src/test/suite/` → zero results.

**T6 — Compile clean**
`npm run compile` → exit 0. `npm run compile-tests` → exit 0.

**T7 — All tests green**
`npm test` → all suites pass, same count as before.

## Dependencies
- **#198 must merge first.** After #198 lands, `TemplateService` is behind `IRawConfigProvider`. This plan then completes the isolation story: `FakeWorkspaceConfig` enables constructing `Configuration` without VS Code, which in turn means tests can supply a testable `IRawConfigProvider` (i.e., a real `Configuration(fakeConfig)`) without the Extension Host.

## Risk
**Risk:** A test currently uses `config.update` mid-test (not just in `beforeEach`) to change settings between assertions. Switching to `FakeWorkspaceConfig` would require constructing a new `ctrl` rather than mutating settings.  
**Mitigation:** Step 6 audit — read each test file before refactoring. If a mid-test `config.update` is found, split the test into two tests each with its own `ctrl`.

**Risk:** `commands-prev-next.test.ts` `afterEach` blocks contain both config resets AND `showInformationMessage` restores. Partial deletion could leave orphaned `original*` variables.  
**Mitigation:** T5 grep catches any lingering `original*` variables. Audit `afterEach` content before deleting.

## Rollback
`git revert <merge-commit>` — no schema, no migration, no data. Pure TypeScript + test change.
