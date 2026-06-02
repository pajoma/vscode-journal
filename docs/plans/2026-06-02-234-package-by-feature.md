# Plan — Issue #234: Restructure `src/` to package-by-feature + DI

> **Spec:** [docs/specs/2026-06-02-234-package-by-feature.md](../specs/2026-06-02-234-package-by-feature.md)
> **Issue:** [pajoma/vscode-journal#234](https://github.com/pajoma/vscode-journal/issues/234)
> **Branch:** TBD (`refactor/234-package-by-feature`, off `develop` after preconditions met)
> **Created:** 2026-06-02

## Approach

Five sequential phases, each independently shippable and test-green. Order minimizes blast radius: untangle dependencies before moving files, move files before changing semantics. Phase 5 (vscode-free domain) is the only behavior-adjacent step and may split into a follow-up issue.

## Preconditions

- Merge open PRs (#231, #233) before starting Phase 1 — it touches nearly every file. Do not start over an open PR.
- `rm -rf out/` before first compile to drop stale `.test.js` (per `AGENTS.md`).

## Phases

### Phase 1 — Kill the `J` barrel
- Replace every `import * as J from '..'` + `J.X.Y` with named imports from the concrete module.
- Reduce `src/index.ts` to type-only re-exports or remove it.
- Pure mechanical; zero behavior change. Largest diff.
- Verify: `npm run check` green; `grep -r "import \* as J" src/` empty.

### Phase 2 — `Ctrl` → DI container
- Add `app/container.ts` owning singleton service construction (the current `initServices` graph).
- Add `app/register.ts` for command/provider registration; move syntax-highlight + cache wiring to `app/startup.ts`.
- Change command/provider constructors to take narrow interfaces (`IReader`, `IWriter`, `IConfiguration`, …) instead of `Ctrl`.
- Remove two-phase `!` init; container builds in one pass after logger exists.
- Verify: no constructor references concrete `Ctrl`; suite green.

### Phase 3 — Split `Configuration`
- `SettingsReader` — raw `journal.*` reads + scope/windows normalization.
- `PathResolver` — entry/notes/weekly path + file patterns (local + remote variants).
- `TemplateProvider` — header/inline/time template lookups (absorbs `vscode/template-service.ts`).
- Keep `IConfiguration` as the composed facade if needed to limit call-site churn; each class ≤~300 lines.
- Verify: `read-templates.test.ts`, `template-engine.test.ts`, path tests green.

### Phase 4 — Move files into feature folders
- `git mv` into `features/{entries,notes,weekly,tasks,navigation,smart-input,tools}` and `shared/{config,fs,logging,dates,strings,templates,model}`.
- Add `shared/events/` typed `EventEmitter`; convert the `reader.onNotesInjected` callback and the inline weekly-sync in `show-entry-for-date.ts` to published events (`entryOpened`), subscribed by `weekly`/`notes`.
- Fix imports. No logic change beyond the event rewiring.
- Verify: no cross-feature internal imports (grep `features/*/` for sibling-feature paths); suite green.

### Phase 5 — vscode-free domain (may split to follow-up)
- Introduce `shared/editor/` adapter (open/show/save `TextDocument`).
- Change `domain/` (reader/writer/inject) to return paths/data, not `TextDocument`; commands call the editor adapter.
- Verify: `grep -r "vscode" src/features/*/domain/` empty; add pure-node unit tests for domain logic.

## Test scenarios

| Scenario | Check |
|----------|-------|
| Every phase | `npm run check` green |
| Phase 1 done | `grep -r "import \* as J" src/` → empty |
| Phase 2 done | no command ctor takes `Ctrl`; `app/container.ts` sole wiring point |
| Phase 3 done | `Configuration` → 3 classes, each ≤~300 lines; template/path tests green |
| Phase 4 done | no `features/<a>` imports `features/<b>` internals; events flow via `shared/events/` |
| Phase 5 done | `src/features/*/domain/` has zero `vscode` imports; new node-only domain tests pass |
| Regression | full suite (commands-entry, commands-note, commands-weekly, scan-entries, sync) green after each phase |

## Dependencies

- Blocked by open PRs #231, #233 (merge first).
- Touches `docs/PLAN.md` (update Phase 2+ to reflect new layout).

## Risk

| Risk | Mitigation |
|------|-----------|
| Phase 1 huge diff → rebase hell | Merge pending PRs first; land Phase 1 fast as its own PR |
| Hidden cycles surface during barrel removal | Fix per-module; named imports make cycles explicit |
| `Configuration` split breaks scope/remote path resolution | Phase 3 keeps `IConfiguration` facade; lean on existing path/template tests |
| Phase 5 changes return types broadly | Split to its own issue/PR; ship Phases 1–4 first |
| Event rewiring changes fire-and-forget timing | Keep events fire-and-forget with same error-swallowing as today; assert via existing sync tests |

## Rollback

Each phase is a separate PR. Revert the offending PR; earlier phases remain valid. No settings/schema migration, so no data rollback.

## Reference spec

[docs/specs/2026-06-02-234-package-by-feature.md](../specs/2026-06-02-234-package-by-feature.md)
