# Spec: vscode-free domain + `shared/editor` adapter (#239)

> Follow-up to #234 (package-by-feature). Phases 1–4 merged via #235–#238.

## Goal

Separate **pure domain logic** from **VS Code editor I/O** so the bulk of `features/*/` can be unit-tested without an Extension Host. Introduce a single `shared/editor/` adapter that owns every `vscode.TextDocument`/`WorkspaceEdit`/`window` interaction; domain code works with paths, strings, and plain data. Also remove the 3 cross-feature import edges left after Phase 4.

## Why now

`Reader`, `Writer`, `Inject` (`src/features/entries/`) all import `vscode` and return `vscode.TextDocument`. Tests therefore need a real Extension Host (`@vscode/test-cli`, ~30 s) instead of fast node-only runs (`node -e`, ~ms). Pulling editor I/O behind one seam makes the create/resolve/format logic directly testable and confines the host dependency to one reviewed module — the highest-leverage testability win of the restructure (maintainer concurred this is its own issue).

## Honest scope note

Full purity is not uniform across the three services:
- **Reader / Writer** — mostly path resolution + create-or-open; cleanly made path-returning.
- **Inject** — deeply editor-bound (`TextDocument`, `Position`, `WorkspaceEdit`, line scanning). The *computation* (which template, what string, what position) is pure; the *application* (apply edit, save) is not. Split accordingly; the applier lives in `shared/editor/`.

This issue does **not** chase 100% `vscode`-free across every file — it isolates the editor surface to `shared/editor/` and makes the pure parts pure and node-testable. Inject's pure half (`buildInlineString`, position computation) becomes testable; its apply half stays in the adapter.

## In scope

1. **`shared/editor/`** — an `EditorAdapter` (interface `IEditor`) owning:
   - `open(path)` / `show(doc)` / `save(doc)` (currently `Dialogues.openDocument/showDocument/saveDocument`),
   - create-and-open (currently `Writer.createSaveLoadTextDocument`),
   - apply-edit / insert-at-position (currently `Inject.injectString`/`injectInlineString`).
2. **Reader / Writer** return resolved paths + a created/loaded flag (plain data); commands call the editor adapter to materialize the `TextDocument`.
3. **Inject** keeps pure `buildInlineString` / `computePositionForInput` (plain `InlineString` + line/col data, no `vscode.Position`); the apply step moves to the adapter.
4. **Remove cross-feature edges:**
   - `entries → notes` — `LoadNotes` dispatch in `loadPageForInput`: route note-input handling so entries does not import `notes` (e.g. an input-kind handler registry, or move dispatch up to the command layer).
   - `navigation → entries` — move `AbstractLoadEntryForDateCommand` to a neutral location (e.g. `shared/` or `features/entries` exposing it as public API consumed via interface).
   - `smart-input → entries` — `Dialogues` uses `ScanEntries`; relocate `Dialogues` (and/or `ScanEntries`) so neither feature imports the other.
5. **Node-only unit tests** for the now-pure logic (path resolution, inline-string building, position computation, type inference).

## Out of scope

- No user-facing behavior change. No settings/schema/template changes.
- Caching/`onDidChangeConfiguration` for config (tracked in PLAN.md 2.6).
- Rewriting `Dialogues` QuickPick UX.

## Acceptance criteria

1. `grep -rn "from 'vscode'\|import \* as vscode" src/features/*/` shows `vscode` only in `commands/`, `ui/`, and explicitly editor-facing files — **not** in the pure domain modules (reader/writer + Inject's pure half).
2. All `vscode.TextDocument` / `WorkspaceEdit` / `window` access flows through `shared/editor/`.
3. No cross-feature internal imports remain (grep/lint verifiable): the 3 edges above are gone.
4. New node-only unit tests cover path resolution, `buildInlineString`, position computation, and `inferType` — runnable without the Extension Host.
5. `npm run check` (lint + compile + full suite) green.
