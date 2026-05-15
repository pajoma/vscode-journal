# Spec: Maintainability Quick Wins Before 1.1.0 (#188)

## Goal

Fix all low-risk maintainability findings (boundary violations, DRY duplicates, type-safety leaks, legacy cruft, one self-loop bug) before the 1.1.0 release. Heavy refactors (Ctrl → DI, barrel removal, moment removal) remain deferred to PLAN.md later phases.

## Why now

1.1.0 is the milestone. These are mechanical, low-risk fixes with high readability payoff. Cleaning them now avoids compounding: the DI refactor in Phase 2.1 will be harder if boundaries are already violated in more places.

## In scope

### Module boundary violations

| File | Violation | Fix |
|------|-----------|-----|
| `src/model/vscode.ts` | `model/` imports `vscode` and barrel `J.*`; `DecoratedQuickPickItem`, `TimedQuickPick`, `TextMateRule` only used in `provider/features/` | Move the three types to `src/provider/features/` (or a new `src/provider/model.ts`); delete `src/model/vscode.ts` |
| `src/actions/reader.ts:97` | `new J.Provider.SyncNoteLinks(this.ctrl).injectAttachementLinks(...)` — actions layer instantiates a provider | Replace with a callback param or wire `SyncNoteLinks` from the caller (`Startup`) |
| `src/actions/navigation.ts:71` | Reads `vscode.workspace.getConfiguration('journal').get('scopes')` directly | Add `getScopeDefinitions(): ScopeDefinition[]` to `Configuration`; call `ctrl.config.getScopeDefinitions()` |
| `src/provider/commands/open-previous-entry.ts:28`, `open-next-entry.ts:28` | Read `navigation.mode` config directly | Add `getNavigationMode(): Mode` to `Configuration`; call via `ctrl.config` |

### DRY duplicates

| Duplicate | Fix |
|-----------|-----|
| `toLocalFileUri` at `show-entry-for-date.ts:123-136` and `open-journal-workspace.ts:100-113` | Extract to `src/util/paths.ts` (or new `src/util/uri.ts`); remove both copies |
| Remote-session guard at `show-entry-for-date.ts:53-79` and `open-journal-workspace.ts:81-83` | Extract `RemoteSessionGuard` helper (class or function); both callers delegate to it |
| `InsertMemoCommand` (`insert-memo.ts:29-50`) identical to `ShowEntryForInputCommand` (`show-entry-for-input.ts:25-47`); already `@deprecated` | Register `journal.memo` as alias using `ShowEntryForInputCommand.create` in `Startup`; delete `insert-memo.ts` |
| `src/actions/inject.ts:59-72` — `task` and `todo` branches identical | Collapse to single `if (input.flags.match(/task|todo/))` block |

### Type-safety leaks

| Location | Issue | Fix |
|----------|-------|-----|
| `show-entry-for-date.ts:85,95,101`, `open-journal-workspace.ts:87` | `(this.ctrl.config as any)` casts before `getBasePathForLocalOpen`, `getWeekPathPatternForLocalOpen`, `getResolvedEntryPathForLocalOpen` | The methods are already public on `Configuration`; drop the casts |

### Legacy cleanups

| Location | Issue | Fix |
|----------|-------|-----|
| `src/ext/dialogues.ts:560` | `console.log("adding file in scope", ...)` ships to user dev console | Delete the line |
| `src/ext/conf.ts:41` | `var defaultPatternDefinition` | Change to `const` |
| `src/util/logger.ts:135` | `moment` timestamp | Replace with `new Date().toISOString()` |

### Ctrl self-loop bug

| Location | Issue | Fix |
|----------|-------|-----|
| `src/actions/inject.ts` | `this.ctrl.inject.injectString(...)` calls itself through the service locator | Replace with direct `this.injectString(...)` |

## Out of scope

- Full `Ctrl` → DI refactor of `Inject` and `SyncNoteLinks` (PLAN.md Phase 2.1)
- Barrel namespace removal (PLAN.md Phase 2.3)
- Full `moment` removal (PLAN.md Phase 3)
- `new Promise()` wrapper migration (PLAN.md Phase 2.2)

## Acceptance criteria

- All boundary violations fixed as described above
- All DRY duplicates removed
- All `as any` casts dropped from the listed call sites
- `console.log` deleted, `var` → `const`, `moment` → `new Date().toISOString()`
- Self-loop bug resolved
- `npm test` (full suite) green after changes — no new tests required for move/rename items

## Constraints

- No new test files required for move/rename items (existing suite covers)
- Must not touch deferred-phase items
- `var` → `const` change is isolated to `conf.ts:41`; do not sweep the whole file

## Open questions

None.

## Related issues

- Tracks PLAN.md Phase 5.1 (`var` cleanup) and Phase 5.3 (InsertMemoCommand alias) — those items are resolved here
- No blocking cross-issue dependencies
