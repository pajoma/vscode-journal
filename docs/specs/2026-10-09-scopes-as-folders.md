# Spec: Scopes as folders, scoped notes from extension and MCP

> Builds on the MCP server (`mcp-server/`, PR #247).

## Goal

Scopes are tags that organise notes (e.g. `#vera`, `#plan`). It must be possible — from the VS Code extension **and** from the MCP server — to create a scope and to create notes in it. A new scoped note is linked from today's daily entry of the main journal.

Use case: work out a concept with Claude Code, then save it via MCP as a note in the project's scope; the journal links to it.

## Today

- A scope only exists as an entry in `journal.scopes` (settings). There is no command to create one; the extension never writes scopes to settings.
- Scoped notes can only be created via the note picker (`#scope Title`). The `note` flag described in `docs/notes.md` does not exist; `docs/scopes.md` puts `base` inside `patterns`, where it is ignored.
- The link to a scoped note is written into the daily entry *under the scope's base*, not into the main journal.
- In practice, journals keep scopes as hand-made folders (`scopes/<name>/`) without any `journal.scopes` configuration.

## Decisions

1. **A scope is a folder, settings override.** Every sub-folder of the scope root is a scope. `journal.scopes` stays as an optional override per name (`base`, `patterns.notes`, `templates`) and can still define scopes without a folder (e.g. a different repository).
2. **One scope root**, new setting `journal.scopeRoot`, default `${base}/scopes`.
3. **Creating a scope** creates `<scopeRoot>/<name>/.gitkeep` (git does not track empty folders). Scope names: letters, digits, `_` and `-`.
4. **Scoped notes** are stored as `<scopeRoot>/<name>/<file>`, file from `patterns.notes.file` of the scope (default `${input}.${ext}`), `${input}` = title normalised like the extension (`normalizeFilename`). Content from the `note` template (`${input}` = title, `${tags}` = `#<scope>` plus further tags), followed by the given body. Existing notes are never overwritten.
5. **Link** into today's daily entry of the main journal, with the `files` template (default `- NOTE: [${title}](${link})` after `## Notes`), `${link}` relative to the entry. No duplicate links.
6. **Private scopes** (scope name is one of the private tags, `#private`/`#privat` + `PRIVATE_TAGS`): via MCP write-only. Not listed, notes not listable or readable, links to them hidden when entries are read. Creating notes is allowed.

## MCP server (step 1)

Tools: `list_scopes`, `create_scope`, `create_note`, `list_notes`, `get_note`, `append_to_note`. `create_scope` and `create_note` are also available to the write-only token. Notes outside the journal repository (scope `base` elsewhere) are not reachable via MCP. `NOTES_READABLE=false` also blocks `get_note`.

## Extension (step 2)

- Command **Journal: Create Scope** (input box for the name) → creates the folder.
- `getScopes()` = configured scopes ∪ folders under `journal.scopeRoot`; folder scopes resolve notes to their folder.
- Note picker / `journal.note`: `#scope Title` with folder scopes; tags may contain `-`.
- Link goes into today's main journal entry (changes current behaviour for scopes with their own base).
- Fix docs: `docs/scopes.md` (`base` at scope level, folder scopes, create command), `docs/notes.md` (remove the non-existent `note` flag), `package.json` schema of `journal.scopes` (array default, item schema) and the new `journal.scopeRoot`.

## Out of scope

- Nested scopes, scoped daily/weekly entries, moving existing folders (e.g. `projects/`).
- Sharing code between extension and MCP server (candidate for #239).
