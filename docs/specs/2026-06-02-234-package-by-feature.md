# Spec: Restructure `src/` to package-by-feature with shared kernel + DI (#234)

## Goal

Move `src/` from package-by-layer (`commands/`, `journal/`, `model/`, `vscode/`, `features/`, `ui/`, `util/`) to **package-by-feature** with a thin, dependency-free shared kernel. Each feature lives in one directory. Replace the `Ctrl` service-locator with constructor dependency injection, kill the `J` namespace barrel, and (last) make the domain layer VS Code-free.

No user-facing behavior change.

## Why now

A single capability is smeared across many directories. "Notes" spans `commands/show-note.ts`, `journal/parser.ts`, `journal/writer.ts`, `features/entries/load-note.ts`, `features/sync/sync-note-links.ts`, and `vscode/conf.ts` — six directories for one feature. The layering also hides real dependencies and blocks unit testing. This aligns with `docs/PLAN.md` Phase 2+ (DI, named imports, native `async`/`await`, `vscode.workspace.fs`).

## Problems addressed

1. **`J` namespace barrel = circular god-import.** `src/index.ts` re-exports every submodule as `J.Util`, `J.Journal`, etc. Files do `import * as J from '..'` then `J.Util.Ctrl`. Those files are themselves re-exported by `index.ts`, so `index.ts → commands/show-note.ts → index.ts` is a cycle. Kills tree-shaking, breaks go-to-definition, hides dependencies.
2. **`Ctrl` service-locator god-object** (`util/controller.ts`). Every command/provider receives the full `Ctrl` and reaches `ctrl.reader`/`ctrl.writer`/`ctrl.ui`/`ctrl.config`/`ctrl.inject`. Narrow interfaces (`IReader`, …) exist in `model/interfaces.ts` but are unused at call sites. Two-phase init forces `!` assertions on every field. The controller also lives in `util/` — wrong home.
3. **Domain coupled to `vscode`.** `Reader`/`Writer`/`Inject` import `vscode` and return `vscode.TextDocument`, so core logic can't be unit-tested without the Extension Host (hence the no-display workaround in `AGENTS.md`).
4. **`Configuration` god-class** — 708 lines (`vscode/conf.ts`), ~40 public methods mixing raw setting reads, path-pattern resolution, template lookup, scope resolution, windows-path normalization, and local-vs-remote path variants.
5. **Inconsistent buckets.** No rule separates `journal/` vs `features/` vs `ui/`. `scan-entries` is a "feature" but `reader` is "journal"; `codeactions` is in `ui` but `sync` is in `features`; two template modules split across layers (`journal/template-engine.ts` vs `vscode/template-service.ts`).
6. **Orchestration leaks into commands.** `show-entry-for-date.ts` `loadPageForInput` runs fire-and-forget weekly sync via nested `.then/.catch`.
7. **Mixed async styles** — `.then()` chains (`startup.run`, `loadPageForInput`) alongside `async/await`.

## Target structure

```
src/
  extension.ts            # activate/deactivate only
  app/                    # composition root (was vscode/startup + util/controller)
    container.ts          # builds the dependency graph — replaces Ctrl service-locator
    register.ts           # command/provider registration
    startup.ts            # syntax highlighting, cache-invalidation wiring
  shared/                 # kernel — NO feature dependencies
    config/               # split Configuration: SettingsReader | PathResolver | TemplateProvider
    fs/                   # IFileSystem + VscodeFileSystem
    logging/  dates/  strings/
    templates/            # merge template-engine + template-service
    editor/               # the single vscode-TextDocument adapter (open/show/save)
    events/               # typed EventEmitter / mediator for cross-feature signals
    model/                # shared types: Input, FileEntry, ScopedTemplate
  features/
    entries/              # today | tomorrow | yesterday | date | input + entry reader/writer
    notes/                # show-note + load-note + note-path + sync-note-links
    weekly/               # weekly entry + watcher + sync-daily-links
    tasks/                # copy/shift + codeactions + migrate codelens
    navigation/           # prev/next entry
    smart-input/          # match-input + parser + input dialog
    tools/                # print-time | print-duration | print-sum
```

Each feature folder: `commands/` (VS Code handlers) · `domain/` (pure logic, no vscode) · `ui/` (providers).

### Separation rules

- A feature may import from `shared/`. A feature must **never** import another feature's internals.
- Cross-feature interaction goes through `shared/events/` — a small typed `EventEmitter`/mediator. Example: `entries` emits `entryOpened` → `weekly` subscribes and runs daily-link sync. No feature-to-feature imports. *(Maintainer recommendation, #234 review.)*
- `domain/` imports no `vscode`; it returns data/paths. `commands/` plus the `shared/editor/` adapter handle `TextDocument`.
- Inject narrow interfaces (`IReader`, not `Ctrl`) via constructor. `app/container.ts` builds the graph once.

### Service lifecycle

`app/container.ts` is the single owner of service lifecycles. All services are **singletons** (one instance per activation), matching the current single-`Ctrl` model. No separate `shared/state/` module is introduced unless genuinely mutable cross-feature state appears — out of scope for this issue. *(Maintainer recommendation, #234 review.)*

## In scope

- Directory restructure to package-by-feature.
- Remove `J` barrel / `import * as J`; named imports throughout.
- Replace `Ctrl` with `app/container.ts` DI; commands take narrow interfaces.
- Split `Configuration` into ≤3 focused classes.
- Add `shared/events/` typed emitter for cross-feature signals.
- Make `domain/` VS Code-free via `shared/editor/` adapter (Phase 5 — may split to a follow-up issue).
- Update `docs/PLAN.md` to reflect the new structure.

## Out of scope

- No user-facing behavior change. No new settings, commands, or templates.
- No change to the `journal.*` settings schema or file/path patterns in `package.json`.
- i18n strings unchanged (English-only, per `AGENTS.md`).
- No new mutable state module (`shared/state/`) unless a concrete need surfaces.

## Preconditions

- **Merge pending PRs first** (notably #231, #233). Phase 1 touches nearly every file; landing it over open PRs causes large rebase conflicts. *(Maintainer recommendation, #234 review.)*

## Acceptance criteria

1. `npm run check` (lint + compile + test) green after **every** phase.
2. No `import * as J from` remaining; `src/index.ts` barrel removed or reduced to type-only re-exports.
3. No command/provider depends on concrete `Ctrl`; all take narrow interfaces wired in `app/container.ts`.
4. `Configuration` split into ≤3 focused classes, none over ~300 lines.
5. Each feature directory is self-contained; no cross-feature internal imports (verifiable by grep/lint rule).
6. Cross-feature signals flow through `shared/events/`.
7. `docs/PLAN.md` updated to reflect the new structure.
