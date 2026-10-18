# Testing 1.2.0-a2

Package: `vscode-journal-1.2.0-a2.vsix` (built 2026-10-18), from local branch `alpha/1.2.0-a2`: `develop` plus #294 (release), #296, #297, #298, #56, #299, #300. None of them is merged yet.
New since 1.2.0-a1: #298, #56 (docs only), #299, #300. The checks for #296 and #297 are in `testing-1.2.0-a1.md`.

## Install

- [ ] Run `code --install-extension vscode-journal-1.2.0-a2.vsix --force`, then **Developer: Reload Window**.
- [ ] The Extensions view shows version 1.2.0-a2.
- [ ] **Journal: Today** opens today's entry right after a restart (regression check for #296).

## MCP: notes before generated blocks (#298)

- [ ] Add a note to today's entry through the MCP (e.g. ask Claude to note something). It lands in the notes area above the `## Claude-Sessions` table, not below it.

## Note list without weekly entries (#299)

- [ ] Ctrl+Shift+J → **Select/Create a note**: no weekly entries (`2026-w42` etc.) in the list.
- [ ] Open a weekly entry, e.g. `2026/2026-w42.md`: the `## Daily Entries` links are those of week 42, not of another week.
- [ ] In a weekly entry, **Open Previous** / **Open Next** (Ctrl+J , / Ctrl+J .) go to week 41 / 43.

## Search (#300)

- [ ] Ctrl+Shift+J shows the new row **Search journal**; **Journal: Search Journal** in the command palette opens the same search.
- [ ] Open a window with a different workspace (not the journal): the search finds journal files there too.
- [ ] Wait ~10 s after starting VS Code, then search: results appear at once, without a spinner. With `journal.dev` on, the output channel shows "Search index built in … ms".
- [ ] A word from the text of an entry: the hit shows the matching line; Enter opens the file at that line.
- [ ] Typos and word beginnings: `agnda` finds "agenda", `plan` finds "Planung", `muller` finds "Müller".
- [ ] Two words: only files with both are listed.
- [ ] `#<scope> word` limits the hits to that scope.
- [ ] Ranking: a note with the word in its title is above entries that only mention it; among similar hits, recent ones come first.
- [ ] Edit an old note, search again: it doesn't jump to the top.
- [ ] Create a file in the journal from outside VS Code (Finder, terminal), search again: it's found.

## Search settings (#300)

- [ ] `journal.search.enabled: false`: the row disappears from the smart input; the command shows a message with **Open Settings**.
- [ ] `journal.search.content: false`: words that appear only in the text are no longer found; titles still are.
- [ ] `journal.search.recency: off` vs. `high`: the order of hits for a common word changes.
- [ ] `journal.search.maxResults: 5`: at most five hits.
- [ ] `journal.search.indexOnStartup: never`, then restart: the first search shows a spinner while it reads the journal.
- [ ] The settings and their descriptions appear in the Settings editor, in German with German display language.

## Image paste (#56, docs only)

- [ ] Add the `markdown.copyFiles.destination` rule from `docs/notes.md` with your journal path, paste an image into today's entry: it lands in `2026/10/assets/2026-10-18-<name>.png` and is linked.
