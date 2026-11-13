# Spec: Scopes, keys and plans

> Builds on [Scopes as folders](2026-10-09-scopes-as-folders.md) and on the Super Productivity integration (branch `feat/super-productivity`, not merged).

## Goal

Scopes are the projects of the journal. Their folder holds the plan (the work breakdown structure, WBS) and the notes; the work itself happens in the daily and weekly entries. A task of the plan can be pulled into a day, and finishing it there finishes it in the plan. Scope, task and tag each have their own syntax, the same in the extension and in the MCP server.

## Today

- `#name` is a tag and, if a scope of that name exists, also the scope, but only for notes (`resolveNotePathForInput`). Memos and tasks with `#acme` land in the daily entry with the tag in the text.
- **Journal: Create Scope** asks only for a name and creates `<scopeRoot>/<name>/.gitkeep`.
- Two kinds of scope with different note paths: folders below `journal.scopeRoot`, and entries in `journal.scopes` with their own `base` and date patterns.
- Matching a tag to a scope is case-sensitive; creating a scope, the search and the MCP server ignore case. The MCP server can create a scope `default`. Scope templates for tasks and memos are never used.
- The MCP tools `add_task`, `add_memo` and `add_note` have no scope. Scope scanning and validation exist twice, in the extension and in `mcp-server/src/scopes.ts`.
- Tasks have no identity: the task code actions, moving and the Super Productivity link work on the text of a line.
- `src/features/tasks/codelens/*` and `vscode-codelens.ts` are not registered (dead code).

## Decisions

### Syntax

| Written | Meaning |
|---|---|
| `+acme` | scope `acme` |
| `+acme:122` | key of item 122 in scope `acme`; implies `+acme` and replaces it on the line |
| `:122` | key in the default scope; only as a whole word (start of line or space before it, space or end after it), so `10:30` is no key |
| `#label` | tag, nothing else |

1. **Slugs** are `[a-z][a-z0-9-]*`, unique, matched without case. They start with a letter, so `+1` stays the day offset of the smart input. `default` is reserved.
2. **`#name` no longer means a scope.** Old lines are migrated by hand. The smart input hints "Did you mean +acme?" when `#name` is the slug of a scope.
3. **Keys count per scope**, and separately for the default scope: the next key is the highest number in the journal (entries and scope folders) plus one. No counter file.
4. **Keys are given** when a task is created with a scope through the smart input or the MCP server, when a plan item is pulled into a day, by the code action **Set Identifier** (a task without scope gets `:N`), and when a task is synced with Super Productivity (step 3).
5. The grammar colours scopes, keys and tags differently. Ctrl+click on a key opens its plan item.

### Scopes

6. **One kind of scope:** a slug and a folder inside the journal. Folders below `journal.scopeRoot` (default `${base}/scopes`) are found by scanning. Other folders are entries in `journal.scopes`: `{ name, base, templates? }`. The date patterns of `journal.scopes` entries are no longer read.
7. **Scope folders are flat** and have no fixed files.
8. **Journal: Create Scope** asks for the slug, then the folder (prefilled `<scopeRoot>/<slug>`), creates the folder (with `.gitkeep`) and, for a folder outside the scope root, writes the entry to `journal.scopes`. It warns if `+slug` already appears in the journal.
9. **Notes:** `+acme Title` creates the note in the scope folder and links it from the day's entry, as today.
10. **Tasks and memos stay in the daily and weekly entries.** A task keeps `+acme` or its key; memos are not routed.
11. The task and memo templates of a scope are used for its tasks and memos.

### Plan and execution

12. **The plan** of a scope is every checklist item with a key in a file of its folder, structured by headings (phases, milestones) and nesting (work packages). **Executions** are the lines with that key in daily and weekly entries.
13. **Two plan items with the same key** are marked as an error in the editor.
14. **New task state `[/]`, in progress**, next to `[ ]`, `[x]` and `[>]`; read by journal-core, the grammar and the MCP server.
15. **Pulling a plan item into a day** ("Plan for today / tomorrow / next working day" on the plan item) copies it into that day's entry with its key and a link to its file; the plan item becomes `[/]`. Open sub-items go along, as they do today.
16. **Moving the copy on** (`[>]` and a new copy) keeps the plan item `[/]`. **Completing the copy** completes the plan item with `(done: …)` and a link to the day; **reopening** sets it back to `[/]`. A plan item can also be completed directly.
17. **The plan is updated** when a journal file is saved (this also covers boxes ticked by hand) and right away by the code actions and the MCP tools.
18. **Progress of a parent** (`3/5`) is shown in the editor only, never written into the file. The MCP server computes it when it returns the plan.

### Scope report

19. **Journal: Show Scope Report** opens a read-only generated document: the plan by heading with the state of each item, and the tasks of the scope (key or `+acme`) in the journal of the last 30 days, by day. Nothing is saved. The MCP tool `get_scope_report` returns the same.

### Super Productivity (rework of the integration)

20. **Project** of a task: from its scope (slug = project title without case, or `journal.superProductivity.projects` by slug); otherwise the inbox. Tags (`#label`) are not synced.
21. **From a plan, only leaf items** become tasks. Title with the key (`+acme:12 write interview guide`), description with the breadcrumb (`acme › Phase 1: Discovery › Interviews`) and the file.
22. **No ids in the markdown.** The link key → task id is kept in `<journal base>/.vscode/superproductivity.json`, committed with the journal, one entry per key, sorted.
23. **Conflicts:** the sync rules stay as they are (completed there → completed in the journal; completed in the journal and open there → the more recent change wins); conflicts beyond that are resolved by hand.
24. **Links of the beta** (`<!-- sp:… -->`) are converted on the first sync: the line gets a key, the id moves into the mapping file, the comment is removed.

### MCP server

25. The same rules from journal-core: scope, key and tag parsing, key allocation, plan update. `add_task` and `add_note` take a scope; new tools for the plan of a scope and `get_scope_report`. The scope scanning and validation of `mcp-server/src/scopes.ts` move into journal-core.

## Steps

Each step is a feature branch and a PR against `develop`.

1. **Syntax and keys** (this branch): scope, key and tag parsing in journal-core; key allocation; Set Identifier; smart input and MCP with `+scope`; Create Scope with folder; one kind of scope; scope templates; case handling, `default` reserved; remove the dead CodeLens code; `docs/scopes.md`, `docs/settings.md`, `docs/smartInput.md`.
2. **Plan and execution:** `[/]`, pulling into a day, plan update on save and by the actions, progress of parents, duplicate keys.
3. **Super Productivity:** the integration of `feat/super-productivity` reworked to keys, mapping file, conversion of the beta links, leaves only, breadcrumb.
4. **Scope report** and `get_scope_report`.

## Out of scope

- Migrating existing journals (`#name` → `+name`, scope folders): by hand.
- Three-way sync with Super Productivity; tags in Super Productivity.
- Nested scopes, scoped daily and weekly entries.
- Renumbering keys.
