# Plan — Issue #239: vscode-free domain + `shared/editor` adapter

> **Spec:** [docs/specs/2026-06-02-239-vscode-free-domain.md](../specs/2026-06-02-239-vscode-free-domain.md)
> **Issue:** [pajoma/vscode-journal#239](https://github.com/pajoma/vscode-journal/issues/239)
> **Branch:** `refactor/239-vscode-free-domain` (off `develop`)
> **Created:** 2026-06-02

## Approach

Five staged steps, each test-green and independently shippable. Edges first (cheap, unblocks reasoning about ownership), then the editor adapter, then domain return-type changes, then tests. Keep `IEditor` on the `JournalController` so commands reach it via the interface (consistent with Phase 2 DI).

## Steps

### Step 1 — Remove cross-feature edges
- **smart-input → entries:** move `Dialogues` to `shared/` (it is a generic UI service, already used broadly) OR move `ScanEntries` to `shared/`. Prefer moving `Dialogues` → `shared/dialogues/` since it implements `IDialogues` (a shared interface). Re-point `Container`.
- **navigation → entries:** move `AbstractLoadEntryForDateCommand` to `shared/commands/` (or `features/entries` export consumed only via a shared base). Navigation extends the shared base.
- **entries → notes:** in `loadPageForInput`, replace the direct `new LoadNotes(...)` branch with a note-input handler resolved from the `JournalController` (register a `noteLoader` in the container, or move the `NoteInput` branch up into the command-registration layer). Entries no longer imports `notes`.
- Verify: cross-feature grep (the #234 Phase-4 script) returns zero edges; suite green.

### Step 2 — `shared/editor/` adapter
- Add `IEditor` to `shared/model/interfaces.ts`: `open(path)`, `show(doc)`, `save(doc)`, `createAndOpen(path, content)`, `applyEdit(doc, edits)` / `insert(doc, position, text)`.
- Implement `EditorAdapter` in `shared/editor/`, moving the bodies from `Dialogues.openDocument/showDocument/saveDocument`, `Writer.createSaveLoadTextDocument`, and `Inject.injectString/injectInlineString`.
- Add `editor: IEditor` to `JournalController` + `Container`.
- Verify: suite green (behavior identical; just relocated).

### Step 3 — Writer / Reader return data
- `Writer.createEntryForPath/createWeeklyForPath` → return the resolved path + content (or a small `CreatedFile` record); the command/reader calls `editor.createAndOpen`.
- `Reader.loadEntryFor*` → return `{ path, created: boolean }` (plain data, no `vscode`); the command opens via `editor.open`. The `onNotesInjected`/`entryOpened` event still fires from the command layer.
- Drop `import * as vscode` from `reader.ts` / `writer.ts`.
- Verify: `grep "vscode" reader.ts writer.ts` empty; suite green.

### Step 4 — Inject split
- Keep pure: `buildInlineString` (returns `InlineString`), position computation → return a plain `{ line, character }` instead of `vscode.Position`.
- Move apply (`injectString`, `injectInlineString`, `injectInput`'s edit application) to `EditorAdapter`.
- `inject.ts` pure half drops `vscode` import; the editor adapter owns `WorkspaceEdit`.
- Verify: pure half has no `vscode`; suite green.

### Step 5 — Node-only unit tests
- Add `src/test/unit/` (plain node, not Extension Host) covering: path resolution (`PathResolver`), `buildInlineString`, position computation, `inferType`.
- Wire into the test pipeline (separate `node --test` or extend compile-tests + a node runner). Document the command in AGENTS.md.
- Verify: node-only tests pass without a display; full Extension-Host suite still green.

## Test scenarios

| Scenario | Check |
|----------|-------|
| Each step | `npm run check` green |
| Step 1 | cross-feature edge grep → 0; commands-prev-next, commands-note, scan/quickpick tests green |
| Step 2 | open/show/save + create-and-open behavior unchanged (commands-entry real-fs, issue-51 remote) |
| Step 3 | `grep vscode reader.ts writer.ts` empty; entry/weekly create+open tests green |
| Step 4 | `grep vscode` on Inject pure half empty; commands-inject (memo/task insertion) green |
| Step 5 | node-only unit tests pass with no Extension Host |
| Regression | full suite (238+) green after every step |

## Risks

| Risk | Mitigation |
|------|-----------|
| Return-type change ripples to many call sites | Stage 3/4 isolated; `IEditor` on `JournalController` keeps call sites uniform |
| Remote-path edge cases (local-vs-remote open) regress | issue-51 + remote tests cover; keep `getResolvedEntryPathForLocalOpen` flow intact |
| Inject apply semantics (WorkspaceEdit ordering) change | Move bodies verbatim into adapter; commands-inject asserts inserted text/position |
| Moving `Dialogues` to shared churns imports | Mechanical; `Container` is the only constructor site |
| Note-dispatch indirection adds complexity | Keep it minimal (a `noteLoader` callback or command-layer branch), not a generic plugin system |

## Rollback

Each step is a separate PR. Revert the offending PR; earlier steps remain valid. No settings/schema/data migration.

## Reference spec

[docs/specs/2026-06-02-239-vscode-free-domain.md](../specs/2026-06-02-239-vscode-free-domain.md)
