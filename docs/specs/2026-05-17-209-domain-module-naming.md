# Spec: Domain Module Naming (#209)

## Goal

Rename source directories from generic technical labels (`ext`, `actions`, `util`, `provider/*`) to journaling-domain terms that reveal intent at a glance.

## Why Now

Phase 2 DI work (#207, #208) stabilized interfaces and service construction. Renaming now — before the barrel-import removal in Phase 2.3 — means the new paths are the canonical ones when named imports replace `J.*` namespaces. Doing it after 2.3 would require updating hundreds of named imports immediately.

## In Scope

Full directory rename + import path update for all TypeScript source files under `src/`. No logic changes.

### Mapping

| Current path | New path | Reason |
|---|---|---|
| `src/ext/` | `src/core/extension/` | VS Code lifecycle/config is extension plumbing, not domain |
| `src/actions/` | `src/core/journal/` | Core read/write/inject logic _is_ the journal domain |
| `src/util/` | `src/core/infrastructure/` | Controller, logger, paths, strings — infrastructure, not domain |
| `src/provider/commands/` | `src/commands/` | Commands are a top-level surface, not a provider sub-concern |
| `src/provider/codeactions/` | `src/ui/codeactions/` | VS Code UI surface grouped under `ui/` |
| `src/provider/codelens/` | `src/ui/codelens/` | VS Code UI surface grouped under `ui/` |
| `src/provider/features/sync-daily-links.ts`<br>`src/provider/features/sync-note-links.ts` | `src/features/sync/` | Sync is a domain feature, distinct from navigation |
| `src/provider/features/scan-entries.ts`<br>`src/provider/features/load-note.ts`<br>`src/provider/features/show-pick-list.ts`<br>`src/provider/features/weekly-entry-watcher.ts` | `src/features/navigation/` | These power the "find and open" UX flow |
| `src/provider/features/match-input.ts` | `src/core/journal/match-input.ts` | Smart-input resolver is parser-adjacent core logic |
| `src/model/` | `src/model/` | Already neutral; no rename |

`src/provider/` disappears entirely once all sub-paths are redistributed.

### Barrel index.ts

`src/index.ts` currently exports namespaces `J.Extension`, `J.Actions`, `J.Model`, `J.Util`, `J.Provider`. Update re-export paths to new locations; **keep namespace keys unchanged** (`J.Util`, `J.Actions`, etc.) to avoid churn in all consumers. Phase 2.3 eliminates the barrel entirely — that is the correct place to update consumer import sites.

`src/provider/index.ts` is deleted (no new top-level `provider/` exists).

## Out of Scope

- Logic changes of any kind
- Renaming barrel namespace keys (`J.Util` → `J.Infrastructure` etc.) — that belongs in Phase 2.3 alongside consumer migration
- Renaming individual files (only directories change)
- `src/model/` (unchanged)
- `src/test/` (test files update their import paths but directory structure unchanged)
- `src/extension.ts` entry point (stays at root)

## Acceptance Criteria

1. `src/provider/` directory no longer exists.
2. New directories match the mapping table exactly.
3. `npm run compile` succeeds (zero esbuild errors).
4. `npm run compile-tests` succeeds (zero tsc errors).
5. `npm test` passes with the same test count as `develop` before the rename.
6. `AGENTS.md` updated: all path references (`src/ext/`, `src/actions/`, `src/util/`, `src/provider/…`) reflect new locations.
7. `docs/PLAN.md` updated: path references in open backlog items reflect new locations.

## Entities / Contracts

No type or interface changes. All interfaces in `src/model/interfaces.ts` are unchanged. Barrel namespace keys are unchanged (see above).

## Constraints

- Pure rename: zero diff to `.ts` file bodies except import path strings.
- Must land on a branch that descends from `develop` after #207 and #208 are merged.
- `src/index.ts` barrel must remain functional until Phase 2.3.

## Open Questions

None — all ambiguities resolved in session 2026-05-17.

## Related Issues

- Precedes: Phase 2.3 barrel/named-import removal (no issue number yet)
- Follows: #207 (JournalController interface), #208 (constructor injection)
