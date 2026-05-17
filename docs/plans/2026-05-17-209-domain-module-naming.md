# Plan: Domain Module Naming (#209)

## Reference Spec

[docs/specs/2026-05-17-209-domain-module-naming.md](../specs/2026-05-17-209-domain-module-naming.md)

## Approach

All `git mv` operations run first (preserves move history), then all import-path fixes, then all barrel-key fixes, then a single `tsc` + `esbuild` + test run to verify. Doing it one-directory-at-a-time would require multiple compile passes for no benefit on a pure rename.

**Dependency:** branch must descend from `develop` after #208 is merged and tested.

## Steps

### 1. Branch

```
feat/209-domain-module-naming
```

Branch from `develop` after confirming `npm test` passes on `develop`.

### 2. Move directories (git mv)

Execute in order. Each `git mv` preserves file history.

```bash
# Directories
git mv src/ext src/vscode
git mv src/actions src/journal
git mv src/provider/commands src/commands
mkdir -p src/ui src/features/sync src/features/entries
git mv src/provider/codeactions src/ui/codeactions
git mv src/provider/codelens src/ui/codelens
git mv src/provider/features/sync-daily-links.ts src/features/sync/sync-daily-links.ts
git mv src/provider/features/sync-note-links.ts   src/features/sync/sync-note-links.ts
git mv src/provider/features/scan-entries.ts       src/features/entries/scan-entries.ts
git mv src/provider/features/load-note.ts          src/features/entries/load-note.ts
git mv src/provider/features/show-pick-list.ts     src/features/entries/show-pick-list.ts
git mv src/provider/features/weekly-entry-watcher.ts src/features/entries/weekly-entry-watcher.ts
git mv src/provider/features/match-input.ts        src/journal/match-input.ts
git mv src/util/paths.ts                           src/journal/paths.ts
# src/provider/ is now empty except for its index.ts — delete it below
```

### 3. Create new index files

Three new barrel indexes needed. Files that `src/provider/index.ts` previously covered are now split across three locations.

**`src/ui/index.ts`** — re-exports from codelens + codeactions:
```typescript
export { MigrateTasksCodeLens } from './codelens/migrate-tasks';
export { ShiftTaskCodeLens } from './codelens/shift-task';
export { CompletedTaskActions } from './codeactions/for-completed-tasks';
export { OpenTaskActions } from './codeactions/for-open-tasks';
```

**`src/features/sync/index.ts`** — re-exports from sync:
```typescript
export { SyncNoteLinks } from './sync-note-links';
export { SyncDailyLinks } from './sync-daily-links';
```

**`src/features/entries/index.ts`** — re-exports from entries:
```typescript
export { WeeklyEntryWatcher } from './weekly-entry-watcher';
export { LoadNotes } from './load-note';
export { ScanEntries, sortPickEntries, DecoratedQuickPickItem, TimedQuickPick } from './scan-entries';
```

**`src/features/index.ts`** — aggregates both feature sub-folders:
```typescript
export * from './sync';
export * from './entries';
```

### 4. Delete src/provider/

```bash
rm src/provider/index.ts
rmdir src/provider/features   # empty after git mv
rmdir src/provider             # empty after all moves
```

### 5. Update src/index.ts (root barrel)

Replace the five export lines:

```typescript
// Before:
export * as Extension from './ext';
export * as Model     from './model';
export * as Actions   from './actions';
export * as Util      from './util';
export * as Provider  from './provider';

// After:
export * as VSCode    from './vscode';
export * as Model     from './model';
export * as Journal   from './journal';
export * as Util      from './util';
export * as Commands  from './commands';
export * as UI        from './ui';
export * as Features  from './features';
```

### 6. Update src/journal/index.ts

Add `MatchInput` (just moved here) and the `paths` functions (just moved here). Remove nothing else.

Add to end of existing exports:
```typescript
export { MatchInput } from './match-input';
export {
    checkIfFileIsAccessible,
    getDateFromURI,
    getDateFromURIAndConfig,
    getFileInURI,
    getFilePathInDateFolder,
    getPathAsString,
    getPathOfMonth,
    getWeekFromURIAndConfig,
    inferType,
    resolvePath,
} from './paths';
```

### 7. Update src/util/index.ts

Remove the `paths` re-exports (they moved to `src/journal/index.ts`):

```typescript
// Delete these lines:
export {
    checkIfFileIsAccessible,
    getDateFromURI,
    getDateFromURIAndConfig,
    getFileInURI,
    getFilePathInDateFolder,
    getPathAsString,
    getPathOfMonth,
    getWeekFromURIAndConfig,
    inferType,
    resolvePath,
} from './paths';
```

### 8. Fix import paths in moved files

Every moved file has broken relative imports. Fix rule: update paths to reflect new location. `tsc` is authoritative for completeness.

**Depth changes (not just name changes):**

`src/provider/commands/` (depth 3) → `src/commands/` (depth 2). Every file in commands must change:
- `import * as J from '../..'` → `import * as J from '..'`
- `import { X } from '../../model'` → `import { X } from '../model'`
- `import { X } from '../../ext'` → `import { X } from '../vscode'`
- any other `../../X` → `../X`

All other moves stay at depth 3 — barrel path `../..` unchanged.

**Name-change-only imports (same depth, different directory name):**

`src/features/entries/*.ts` and `src/features/sync/*.ts` — were at `src/provider/features/` (depth 3). Barrel `../..` stays. Direct imports change name only:
- `from '../../ext'` → `from '../../vscode'` (e.g. `SCOPE_DEFAULT` in `scan-entries.ts`)
- `from '../../actions'` → `from '../../journal'`

**`src/journal/paths.ts`** — moved from `src/util/`. Sibling imports need cross-directory prefix added:
- `from './strings'` → `from '../util/strings'`
- `from './util'` → `from '../util/util'`
- `from './dates'` → `from '../util/dates'`

No cycle: `journal/` → `util/` is unidirectional. `util/` does not import from `journal/`.

**Config files — audited, no action needed:**
- `esbuild.mjs` entry point: `src/extension.ts` (unchanged, stays at root)
- `.vscode/launch.json`: references `out/` and `dist/` output paths only, not source
- `package.json` `main`: `./dist/extension.js` — output only
- `tsconfig.json`: no explicit source directory references

### 9. Fix barrel-key consumer sites

**Scope clarification:** 47 total files use the `J.` namespace. Only ~14 need updates: the 12 files using `J.Extension|J.Actions|J.Provider` (barrel keys being renamed) plus 2 files (`sync-daily-links.ts`, `scan-entries.ts`) using `J.Util.getDate*/infer*/resolve*` (paths functions moving from `J.Util` to `J.Journal`). The remaining 33 files use only `J.Util.*` (non-paths) and `J.Model.*` — keys unchanged, no edits needed.

Files using old `J.*` keys that need updating:

```bash
# Find all consumer sites:
grep -rn "J\.Extension\|J\.Actions\|J\.Provider" src/ --include="*.ts"
```

Apply substitutions:

| Old | New | Note |
|---|---|---|
| `J.Extension.` | `J.VSCode.` | `src/extension.ts`, `src/vscode/startup.ts` |
| `J.Actions.` | `J.Journal.` | `src/actions/inject.ts` and test files |
| `J.Provider.Commands.` | `J.Commands.` | `src/vscode/startup.ts` |
| `J.Provider.MigrateTasksCodeLens` | `J.UI.MigrateTasksCodeLens` | `src/vscode/startup.ts` |
| `J.Provider.SyncNoteLinks` | `J.Features.SyncNoteLinks` | `src/vscode/startup.ts` |
| `J.Provider.SyncDailyLinks` | `J.Features.SyncDailyLinks` | `src/vscode/startup.ts` |
| `J.Provider.WeeklyEntryWatcher` | `J.Features.WeeklyEntryWatcher` | `src/vscode/startup.ts` |
| `J.Provider.LoadNotes` | `J.Features.LoadNotes` | command files |
| `J.Provider.ScanEntries` | `J.Features.ScanEntries` | command files |
| `J.Provider.MatchInput` | `J.Journal.MatchInput` | command files |
| `J.Util.getDateFromURIAndConfig` | `J.Journal.getDateFromURIAndConfig` | files using paths functions via barrel |
| `J.Util.getDateFromURI` | `J.Journal.getDateFromURI` | files using paths functions via barrel |
| *(other J.Util.get*/infer/resolve* exports from paths.ts)* | `J.Journal.*` | same pattern |

Also update `src/provider/commands/show-entry-for-date.ts` (now `src/commands/show-entry-for-date.ts`) which uses both `J.Provider` and `J.Actions` patterns.

### 10. Verify

```bash
npm run compile-tests   # tsc — catches all broken relative imports and type errors
npm run compile         # esbuild — catches bundler-level issues
npm test                # full suite — must match pre-rename test count
```

After compile-tests passes, run the grep assertions:

```bash
grep -rn "J\.Extension\|J\.Actions\|J\.Provider" src/ --include="*.ts"
# Must return empty

grep -rn "J\.Util\.getDate\|J\.Util\.inferType\|J\.Util\.resolvePath\|J\.Util\.getFile\|J\.Util\.getPath\|J\.Util\.getWeek\|J\.Util\.checkIf" src/ --include="*.ts"
# Must return empty (paths functions now live on J.Journal)

ls src/provider 2>&1
# Must: "No such file or directory"
```

### 11. Update documentation

- `AGENTS.md`: update all path references in **Architecture** section, **Module responsibilities** listing, **Reusable building blocks**, and **Testing patterns** — replacing old paths (`src/ext/`, `src/actions/`, `src/util/paths.ts`, `src/provider/…`) with new ones and barrel key examples (`J.Util.Ctrl` → `J.Util.Ctrl` unchanged, `J.Actions.Writer` → `J.Journal.Writer`).
- `docs/PLAN.md`: update path references in Phase 2 and Phase 3 open items (e.g., `provider/features/scan-entries.ts` → `features/entries/scan-entries.ts`, `ext/conf.ts` → `vscode/conf.ts`).

### 12. PR

Branch: `feat/209-domain-module-naming` → `develop`

PR description links: issue #209, spec doc, plan doc, dependency #208.
Post one line on issue: "PR #X opens — implementing approved plan."

## Test Scenarios

| Scenario | Type | Covers AC |
|---|---|---|
| `npm run compile` exits 0 | unit (build) | AC3 |
| `npm run compile-tests` exits 0 | unit (build) | AC4 |
| `npm test` passes, count matches pre-rename | integration | AC5 |
| `grep J\.Actions src/ --include=*.ts` returns empty | grep assertion | AC6 |
| `grep J\.Extension src/ --include=*.ts` returns empty | grep assertion | AC6 |
| `grep J\.Provider src/ --include=*.ts` returns empty | grep assertion | AC6 |
| `ls src/provider` fails | filesystem check | AC1 |
| Extension activates in F5 session (manual smoke) | manual | AC3+AC5 |

## Dependencies

- **#208 constructor injection** — must be merged to `develop` and `npm test` green before branching. (barrel and controller changed; merge conflicts likely if not landed first)

## Risk

| Risk | Mitigation |
|---|---|
| Missed relative import after git mv | `npm run compile-tests` is authoritative — tsc catches every broken path |
| Commands depth change (`../../` → `../`) missed | Explicit in Step 8; tsc catches any remaining misses |
| Missed barrel-key consumer | `grep J\.Actions\|J\.Extension\|J\.Provider` grep assertion in Step 10 |
| `J.Util.paths-fn` consumers missed (not in Extension/Actions/Provider grep) | Also grep `J\.Util\.getDate\|J\.Util\.inferType\|J\.Util\.resolvePath\|J\.Util\.getFile\|J\.Util\.getPath\|J\.Util\.getWeek\|J\.Util\.checkIf` — must return empty after Step 9 |
| `paths.ts` cycle after move to `journal/` | Verified no cycle: `journal/paths.ts` imports `../util/{strings,util,dates}` unidirectionally; `util/` has no `journal/` imports |
| `src/provider/commands/index.ts` re-exports `Commands` sub-namespace | Verify `src/commands/index.ts` still correct after the move |

## Rollback

Pure rename — revert branch and delete. No data at risk, no migration, no DB state.
