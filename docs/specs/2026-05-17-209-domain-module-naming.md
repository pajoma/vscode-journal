# Spec: Domain Module Naming (#209)

## Goal

Rename source directories from generic technical labels (`ext`, `actions`, `util`, `provider/*`) to journaling-domain terms that reveal intent at a glance, and align barrel namespace keys to match.

## Why Now

Phase 2 DI work (#207, #208) stabilized interfaces and service construction. Renaming now — before the barrel-import removal in Phase 2.3 — means the new paths are the canonical ones when named imports replace `J.*` namespaces. Doing it after 2.3 would require updating hundreds of named imports immediately.

## In Scope

Full directory rename + import path update for all TypeScript source files under `src/`. Barrel namespace keys updated to match new directories. No logic changes.

### Directory Mapping

> **Amendment 1 (2026-05-17):** Dropped `src/core/` grouping (depth without signal). Kept `src/util/` mostly unchanged. Renamed feature folder `navigation` → `browse` to avoid collision with `src/journal/navigation.ts`.
>
> **Amendment 2 (2026-05-17):** Renamed `src/extension/` → `src/vscode/` to eliminate stutter with `src/extension.ts` entry point. Moved `paths.ts` (journal-specific logic) from `src/util/` to `src/journal/`. Renamed `src/features/browse/` → `src/features/entries/` (domain-specific). Barrel keys aligned in same PR.

| Current path | New path | Reason |
|---|---|---|
| `src/ext/` | `src/vscode/` | VS Code binding layer; avoids stutter with `src/extension.ts` |
| `src/actions/` | `src/journal/` | Core read/write/inject logic _is_ the journal domain |
| `src/util/paths.ts` | `src/journal/paths.ts` | Journal-specific path patterns and template variables |
| `src/util/` (remainder) | `src/util/` | Generic helpers (`dates.ts`, `strings.ts`, `logger.ts`, etc.) |
| `src/provider/commands/` | `src/commands/` | Commands are a top-level surface, not a provider sub-concern |
| `src/provider/codeactions/` | `src/ui/codeactions/` | VS Code UI surface grouped under `ui/` |
| `src/provider/codelens/` | `src/ui/codelens/` | VS Code UI surface grouped under `ui/` |
| `src/provider/features/sync-daily-links.ts`<br>`src/provider/features/sync-note-links.ts` | `src/features/sync/` | Sync is a domain feature, distinct from entry browsing |
| `src/provider/features/scan-entries.ts`<br>`src/provider/features/load-note.ts`<br>`src/provider/features/show-pick-list.ts`<br>`src/provider/features/weekly-entry-watcher.ts` | `src/features/entries/` | All operate on journal entries; domain-specific label |
| `src/provider/features/match-input.ts` | `src/journal/match-input.ts` | Smart-input resolver is parser-adjacent core logic |
| `src/model/` | `src/model/` | Already neutral; no rename |

`src/provider/` disappears entirely once all sub-paths are redistributed.

### Barrel Namespace Key Mapping

`src/index.ts` currently exports `J.Extension`, `J.Actions`, `J.Model`, `J.Util`, `J.Provider`. Keys updated to match new directories; all consumer import sites updated in the same PR.

| Old key | New key | Re-exports from |
|---|---|---|
| `J.Extension` | `J.VSCode` | `src/vscode/` |
| `J.Actions` | `J.Journal` | `src/journal/` |
| `J.Provider` | `J.Commands` + `J.UI` + `J.Features` | `src/commands/`, `src/ui/`, `src/features/` |
| `J.Util` | `J.Util` | `src/util/` (unchanged) |
| `J.Model` | `J.Model` | `src/model/` (unchanged) |

`src/provider/index.ts` is deleted. Three new barrel sub-indexes created: `src/commands/index.ts`, `src/ui/index.ts`, `src/features/index.ts`.

`dates.ts` stays in `src/util/` — it is scheduled for removal in Phase 3 (moment → `Intl`/`date-fns`); moving it now creates churn that will be immediately undone.

## Out of Scope

- Logic changes of any kind
- Renaming individual files (only directories and the `paths.ts` move)
- `src/model/` (unchanged)
- `src/test/` (test files update import paths but directory structure unchanged)
- `src/extension.ts` entry point (stays at root)
- `dates.ts` migration — Phase 3

## Acceptance Criteria

1. `src/provider/` directory no longer exists.
2. New directories match the mapping table exactly.
3. `npm run compile` succeeds (zero esbuild errors).
4. `npm run compile-tests` succeeds (zero tsc errors).
5. `npm test` passes with the same test count as `develop` before the rename.
6. No remaining references to old keys `J.Actions`, `J.Extension`, `J.Provider` in `src/` (grep-verifiable).
7. `AGENTS.md` updated: all path references and barrel key examples reflect new locations/keys.
8. `docs/PLAN.md` updated: path references in open backlog items reflect new locations.

## Entities / Contracts

No type or interface changes. All interfaces in `src/model/interfaces.ts` are unchanged.

## Constraints

- Pure rename: zero diff to `.ts` file bodies except import path strings and barrel key names.
- Must land on a branch that descends from `develop` after #207 and #208 are merged.
- `src/index.ts` barrel must remain functional (keys updated, not removed — that is Phase 2.3).

## Open Questions

None — all ambiguities resolved in session 2026-05-17.

## Related Issues

- Precedes: Phase 2.3 barrel/named-import removal (no issue number yet)
- Follows: #207 (JournalController interface), #208 (constructor injection)
