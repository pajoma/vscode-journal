## On Hold
* Interact with markdown file (ctrl+click) mark checkboxes, etc. (requires a language server) 


### Planned

* Use snippets for inline templates
* Connection to Office 365 to sync tasks 
* More code actions and code lenses (e.g. to pull all open tasks to the current journal entry)

## Unreleased

### Added
* [Issue #318](https://github.com/pajoma/vscode-journal/issues/318) MCP server next to other task tools (Jira, GitHub Issues, …): the task tools say that they work on the user's personal journal and that tickets belong to the tracker's tools, and the server instructions tell the assistant to use the journal only for the user's journal and personal to-dos and to ask when it is unclear. See [Use your journal with AI assistants](./docs/mcp.md#good-to-know).
* [Issue #311](https://github.com/pajoma/vscode-journal/issues/311) Navigation between day, week and month: the first line of a page links up and sideways (CodeLens): a daily entry its previous day, its week and its next day, a weekly entry its previous week, its month and its next week (previous and next follow `journal.navigation.mode`), a note the pages that link to it (backlinks, by markdown or wiki link). The weekly sync links the working days, Monday to Friday, and the weekend days with an entry as wiki links (`- [[2026-10-19|Monday, October 19]]`, the new default `dailyLink` template; a day without entry is created on Ctrl+click); a template with `${link}` keeps linking only the days with an entry. Directly under the title of a weekly entry, the sync keeps its days, weekend included, as a sentence in the journal locale (*Vom Montag, 11. Oktober bis Sonntag, 17. Oktober*). The `## Daily Entries` section is always the first one under the title of a weekly entry: the sync moves it there and adds it where it is missing; the default `weekly` template starts with it. The new **Journal Calendar** (**Journal: Open Calendar**) opens beside the editor: a month with week numbers, every day and every week with the open and all tasks and the notes of its entry, marked while tasks are open, days without entry dimmed; clicks open or create days and weeks, and it follows the entry you open. **Journal: Open Week** opens the week of the current entry. See [Day, week and month](./docs/entries.md#day-week-and-month).
* [Issue #92](https://github.com/pajoma/vscode-journal/issues/92) Wiki links: `[[2026-10-20]]` (the entry of that day, in any layout), `[[2026-w43]]` (weekly entry), `[[Workshop Notes]]` and `[[#projA Workshop Notes]]` (notes by title), `[[20/Minutes]]` (folders in front of a title that is not unique) and `[[…|label]]`. Ctrl+click opens the target and creates a missing entry or note; typing `[[` suggests entries, weekly entries and notes and turns a relative date (`[[yesterday`) into the day it names; the markdown preview shows wiki links as links; the link sync and the MCP server don't link a note again that a wiki link names. See [Wiki links](./docs/notes.md#wiki-links).
* [Issue #309](https://github.com/pajoma/vscode-journal/issues/309) Changing `journal.patterns` no longer hides the entries written before. New setting `journal.patternHistory` (and `patternHistory` in a `journal.scopes` entry): the earlier patterns, newest first. Opening a day finds its entry in the current layout, else in an earlier one, and edits it there; only a day without an entry in any layout gets a new entry in the current layout, so no second entry is created. The default patterns always count as the oldest layout. The MCP server reads and changes entries the same way. Previous/next navigation, the entry and note lists, the search, the daily links of weekly entries and the notes linked from an entry include every layout; previous/next navigation now follows the configured patterns instead of assuming `YYYY/MM/DD.ext`. New command **Journal: Migrate to Current Layout** (`journal.migrateLayout`) moves the daily and weekly entries (and, if chosen, the notes) of the earlier layouts to the current one: a dry run in a webview lists every move, every link change and every conflict and changes nothing until you press Move (or close it, preview only); then it updates the relative links in the journal exactly as shown, never overwrites an existing file and offers to remove emptied layouts from `journal.patternHistory`. Changing the layout in the settings opens a dialog that points to the command and to `journal.patternHistory`. See [Changing the layout](./docs/settings.md#changing-the-layout).
* [Issue #7](https://github.com/pajoma/vscode-journal/issues/7) Smart input: in *Select entry*, the icon of an entry shows its tasks (yellow warning: tasks open; green check: all done; clock: no tasks), and a line below it the number of open tasks and the notes it links, e.g. `2 open tasks · 3 notes`. The list appears as before; icons and notes follow once the files are read. Moved tasks and links to other daily or weekly entries are not counted. See [Smart Input](./docs/smartInput.md).
* [Issue #31](https://github.com/pajoma/vscode-journal/issues/31) New setting `journal.notes.ignore`: file name patterns (e.g. `["*.png", "*.tmp"]`) for files in a notes folder that are not linked from the journal entry. Hidden files, temporary files (`~$…`) and subfolders stay excluded. See [Notes](./docs/notes.md).
* [Issue #172](https://github.com/pajoma/vscode-journal/issues/172) Sub-tasks: tasks indented below a task belong to it. On a task with open sub-tasks, the code actions offer *Complete this task* and *Complete this task and its N open sub-tasks*. *Plan for today/tomorrow/the next working day* takes the open sub-tasks along: they are marked `[>]` and inserted below the task in the target entry; done sub-tasks stay. The MCP server does the same for `move_task` and `migrate_open_tasks`, lists sub-tasks with `level` and `open_subtasks`, and completes a task with open sub-tasks only with `subtasks: true|false`, so the assistant asks you. See [Sub-tasks](./docs/tasks.md#sub-tasks).
* [Issue #301](https://github.com/pajoma/vscode-journal/issues/301) MCP server: the read tools take `detail: "brief"` and then return only what you act on (open tasks with their numbers, memos, totals, note topics), e.g. for a voice conversation. The assistant chooses it; without it, results are complete as before.
* MCP server: tasks in `list_tasks`, `get_daily_journal`, `get_weekly_journal` and the open tasks of `get_daily_briefing` are numbered (`no`: 1, 2, 3 … in the order of the result). The assistant shows the numbers, so you can answer "complete 3"; it maps the number back to the task.
* [Issue #300](https://github.com/pajoma/vscode-journal/issues/300) Search the journal: the new row *Search journal* in the smart input and the command **Journal: Search Journal** (`journal.search`) find entries, weekly entries and notes of all journal folders by title and text, in every window: full-text search with relevance ranking, word beginnings, typo tolerance and accent-insensitive matching (new dependency [MiniSearch](https://github.com/lucaong/minisearch), MIT). Every typed word must match; `#scope` limits the search to a scope. Recent files rank higher, by the day they belong to (not by modification date), also for files from before `journal.patterns` was changed (default patterns, dates in the path). The entry and note lists of the smart input show and sort by this date too, newest first; before, they showed the creation date and sorted by modification time, which for a copied or cloned journal are the day of the copy; a text hit shows the matching line and opens the file there. The index is built in the background a few seconds after VS Code starts (not in remote sessions), so the first search does not wait. New settings `journal.search.enabled`, `journal.search.indexOnStartup`, `journal.search.content`, `journal.search.recency` and `journal.search.maxResults` (see [Settings](./docs/settings.md#search)). See [Smart Input](./docs/smartInput.md#search-the-journal).
* [Issue #292](https://github.com/pajoma/vscode-journal/issues/292) The journal MCP server comes with the extension and runs on VS Code's own Node.js, without a checkout or a Node.js installation. It is off by default: new setting `journal.mcp.enabled` (user settings only); when off, the server does not start for any assistant. GitHub Copilot (agent mode) finds it without setup. New command **Journal: Set up MCP Server** (`journal.setupMcp`) shows the command for Claude Code and Codex (and runs it in a terminal if the CLI is installed), or the configuration block for other assistants. They start a script in the extension's storage folder that the extension keeps up to date, so updates of the extension or of VS Code need no new setup. The extension now starts with VS Code (`onStartupFinished`) to keep this script current. See [MCP](./docs/mcp.md).
* [Issue #149](https://github.com/pajoma/vscode-journal/issues/149) Smart input: `note mon Security Code Review` creates a note for Monday and links it from Monday's entry instead of today's; `note w23 Planning` links it from the weekly entry without creating a daily entry. **Journal: New Note** accepts a day or week before the title, too; words like "note" or "task" stay in the title, and cancelling the dialog no longer shows an error. With `journal.entryGranularity` set to `weekly`, notes from the note picker are linked from the current week's entry (before: from today's daily entry).
* [Issue #137](https://github.com/pajoma/vscode-journal/issues/137) New setting `journal.weeklyTemplateDates` (off by default): the weekly template resolves date variables from the first day of the week, and `${d+1:format}` … `${d+6:format}` give the following days, e.g. one heading per day of the week. `${year}` is then the year the week belongs to. Without the setting, weekly templates behave as before. The MCP server follows the same setting; before, it always resolved date variables in weekly templates.
* Scopes as folders: every folder below the new setting `journal.scopeRoot` (default `${base}/scopes`) is a scope, next to the scopes configured in `journal.scopes`. New command **Journal: Create Scope** (`journal.createScope`) creates a scope folder. Notes titled `#scope Title` are stored in the scope's folder and linked from today's entry when created. Scope tags may contain `-`.
* [Issue #145](https://github.com/pajoma/vscode-journal/issues/145) New command `journal.memo` ("Enter Quick Memo") registered as an alias for the smart input. Users can bind it to a dedicated key or invoke it from the command palette independently of `journal.day`.
* [Issue #185](https://github.com/pajoma/vscode-journal/issues/185) Weekly entries now auto-sync a list of links to all daily entries in the same ISO week, kept up to date while the weekly file is the active editor. New `journal.weeklySync` setting block (`enabled`, `anchor`, `template`, `sortOrder`) controls the behavior. Default `weekly` template ships with a `## Daily Entries` heading; user-customized templates without the anchor are skipped silently. Daily files are never modified — sync is one-directional.
* [Issue #168](https://github.com/pajoma/vscode-journal/issues/168) New setting `journal.entryGranularity` (`daily` default, `weekly` alternative) routes memos, tasks, and new notes into the current week's entry / weekly notes folder when no explicit date target is given. Explicit date input (offset, ISO date, weekday, week number) still wins. Default `weekly` template now includes `## Tasks` and `## Notes` sections; new `journal.patterns.weeklyNotes` default (`${base}/${year}/w${week}`) controls the weekly notes path.
* [Issue #144](https://github.com/pajoma/vscode-journal/issues/144) New commands `journal.openPrevious` (`ctrl+j ,` / `cmd+j ,`) and `journal.openNext` (`ctrl+j .` / `cmd+j .`) step backwards / forwards through journal entries relative to the file currently in focus. New setting `journal.navigation.mode` chooses between `existing` (default — skip gaps to the next entry on disk) and `calendar` (step exactly one day, create if missing). Navigation honors the active scope.

### Fixed
* *Open this task again* recognises tasks completed as `[X]` (uppercase); its pattern was split by a misplaced `|`.
* The first journal command after starting VS Code could take seconds or fail with "command 'journal.day' not found": the extension reported itself as started before its commands were registered. VS Code now waits until they are. **Journal: Set up MCP Server** opens the setting `journal.mcp.enabled` when it can't turn it on itself (e.g. right after installing a new version without reloading the window).
* MCP server: the notes area of an entry ends before a block another tool generates (`<!-- name:begin -->`, e.g. the Claude-Sessions table) and before that block's own heading. Before, `add_note` appended below such a block and `get_daily_journal` listed it as a note.
* [Issue #299](https://github.com/pajoma/vscode-journal/issues/299) The note list of the smart input no longer shows weekly entries: files that match the weeks pattern (`journal.patterns.weeks`), or the default pattern `week_${week}.${ext}` older weekly entries may still use, are weekly entries, not notes. Weekly patterns that contain `${year}` twice, such as `${base}/${year}` with `${year}-w${week}.${ext}`, now give the right week; before, the year was read as the week, which affected the daily-links sync and the navigation in weekly entries.
* [Issue #44](https://github.com/pajoma/vscode-journal/issues/44) Tasks, memos and `#scopes` are colored by your color theme: open boxes like keywords, done and moved tasks like comments, bullets like other list bullets. This works in light, dark and high contrast themes and follows theme switches. The extension no longer writes colors into your user settings, and on startup removes the task colors older versions wrote there (only rules it wrote itself, unchanged; your own rules and other `editor.tokenColorCustomizations` stay). Before, the colors were chosen once from the theme name, so after a theme switch open tasks were yellow on a light background, and with `journal.syntax-highlighting` off every start rewrote `editor.tokenColorCustomizations` with only its `textMateRules`, dropping your other token color settings. Code blocks and inline code keep their own colors, `#tags` are colored as far as the extension reads them (including `-`). Indented tasks are highlighted, a hyphen inside a line is no longer, and `[(]` or `[|]` no longer count as done or moved tasks. `journal.syntax-highlighting` is no longer used.
* [Issue #239](https://github.com/pajoma/vscode-journal/issues/239) Copying a task to today, tomorrow or the next working day saves the target entry after the task was inserted; before, it saved while the insert was still pending.
* [Issue #250](https://github.com/pajoma/vscode-journal/issues/250) Task code actions: a task moved "somewhere else" gets a closed "(moved: somewhere else)" annotation (the closing parenthesis was missing), and reopening a done task without "(done: …)" annotation no longer computes an invalid range.
* [Issue #250](https://github.com/pajoma/vscode-journal/issues/250) New notes: the `note` template resolves date variables and every `${input}`/`${tags}` (before only the first), the title is trimmed and tags are written as `#tag`, as the MCP server writes notes. The MCP server links notes like the extension: a plain relative link (no longer URL-encoded) and `(.pdf) ` in front of files that are not journal files; links with parentheses in the file name are recognised as existing.
* Week 53 in January: with today in a year with 52 weeks, the first day of week 53 of the previous year was computed as week 1 of that year (e.g. 2025-12-29 instead of 2026-12-28 for week 53/2026 in German), and "next week" from week 53 opened week 2. Affected the weekly sync, date variables in weekly paths and templates, and week navigation.
* [Issue #228](https://github.com/pajoma/vscode-journal/issues/228) WSL remote with a Windows `journal.base` (`C:\Users\...`): **Journal: Today** and the other entry commands, and **Journal: Open Journal Workspace**, open the journal in the WSL session via `/mnt/c/...` without asking. Before, they offered to hand the path to the local window, which could open an empty editor with a mixed path such as `/C:\Users\...\journal/2026/05/2026-05-18.md`. SSH and container sessions still ask.
* [Issue #250](https://github.com/pajoma/vscode-journal/issues/250) Week numbers follow `journal.locale`. Before, they followed the language moment.js happened to be set to, so with a German locale "w" on a Sunday or around New Year could open another week than the MCP server writes to (e.g. week 2 instead of 53 on 2027-01-03).
* [Issue #250](https://github.com/pajoma/vscode-journal/issues/250) Weekly entries around New Year: `${year}` in `journal.patterns.weeks` is the year the week belongs to, and other date variables use the first day of the week. Before, the extension took today's date, so in early January "last week" or navigating back a week wrote the entry into the folder of the new year, and in late December "w" could miss the entry the MCP server wrote.
* Smart input: the entry/note picker built its scan directories without the leading `/` on macOS/Linux (it only worked because `vscode.Uri.file` re-adds it); scanned paths are absolute again. Closing the picker with Esc (or Enter without a choice) now simply cancels: no pending promise and no error. Picker listeners are released when the picker closes, and a late result for an outdated input no longer replaces the current row. The row for a typed week ("w23", "next week") shows the week instead of "Invalid date". When the typed input stops parsing (e.g. "task" without text), its row is removed, so Enter no longer runs the previous input.
* [Issue #269](https://github.com/pajoma/vscode-journal/issues/269) Smart input: month abbreviations open the month they name. "Okt 3" and "Dez 24" (German), "Juil", "Fév" and "Avr" (French), "Ene", "Abr" and "Ago" (Spanish), "Gen", "Mag", "Giu", "Lug", "Set", "Ott" and "Dic" (Italian), "Fev", "Set" and "Out" (Portuguese) and "Mrt" (Dutch) were recognized as dates but opened December of the previous year. Weekday and month words are now recognized and resolved from one list.
* [Issue #269](https://github.com/pajoma/vscode-journal/issues/269) Smart input on a Sunday: weekdays are taken from the week ending that Sunday, as on every other day. Before, "last sunday" opened today, "sunday" the next Sunday and "monday" tomorrow instead of the Monday six days ago.
* [Issue #269](https://github.com/pajoma/vscode-journal/issues/269) A tag in the middle of a note title (e.g. "Konzept #work Entwurf" in **Journal: New Note**) appeared twice in the new note's `${tags}`.
* [Issue #269](https://github.com/pajoma/vscode-journal/issues/269) Smart input accepts dates with slashes and year ("2026/10/20"); before, it failed with "Invalid value for month".
* [Issue #269](https://github.com/pajoma/vscode-journal/issues/269) Smart input starting with a number that cannot be a day (e.g. "45 Minuten Sport") is added as text to today; before, it failed with "Invalid value for day".
* Scopes: one rule for duplicate `journal.scopes` names (the first entry wins; before, entry and week patterns used the last one). Navigation no longer assigns journal entries to a configured scope without its own `base`. A configured template without `template` text now falls back to the default text (instead of setting `after`), and loading templates no longer modifies the settings objects. A notes folder removed during the link scan no longer logs an error. Unknown scope names resolve to the default scope, so they use `journal.patterns` (before, the extension's built-in patterns).
* Links to notes in scopes with their own `base` are added to the main journal entry instead of an entry below the scope's base. `journal.scopes` now defaults to `[]` (was `{}`) and has a schema; `docs/scopes.md` placed `base` inside `patterns`, where it was ignored. `journal.scopes` and `journal.scopeRoot` are restricted in untrusted workspaces. `docs/notes.md` described a non-existent `note` flag.
* [Issue #170](https://github.com/pajoma/vscode-journal/issues/170) Word-boundary anchoring on smart-input weekday and month tokens. Entering text that begins with a locale-specific day abbreviation (e.g., "Do" for Donnerstag in German) no longer triggers premature date parsing mid-word; the parser now waits for a full token match before classifying input as a date expression.
* [Issue #167](https://github.com/pajoma/vscode-journal/issues/167) Customizing the weekly entry template via `journal.templates` now takes effect. `Configuration.getWeeklyTemplate()` previously looked up the template under the id `"week"` while the default in `package.json` was registered as `"weekly"`, so user overrides were silently ignored. Aligned the lookup key with the default name (`"weekly"`). Regression test in `src/test/suite/phase1-regression.test.ts`.
* [Issue #51](https://github.com/pajoma/vscode-journal/issues/51) Remote SSH and WSL Remote no longer surface a "File not found" error toast on first-time creation of an entry, weekly page, or note. Replaced the open-before-create antipattern in `Reader.loadEntryForDay`, `Reader.loadEntryForWeek`, and `LoadNotes.loadNote` with a stat-first check (new `fileExists` helper in `src/util/fs-exists.ts`) and migrated the three methods to native `async/await`.

### Changed
* [Issue #320](https://github.com/pajoma/vscode-journal/issues/320) New memos, tasks and note links go below the existing ones (oldest first), where before the newest was inserted directly below the `after` anchor. The extension and the MCP server now place lines with the same rule (journal-core): below the template's `after` anchor, after the lines of the same kind in that section (a task after the sub-tasks of the last task); without `after`, below the title, grouped with the lines of the same kind; a missing `after` heading is created below the title. A task follows its heading directly, without a blank line. A new weekly entry written by the MCP server starts like one of the extension: date sentence and `## Daily Entries` with the links of its days. Internally: the notes link sync reads the notes folder through the file system seam, `features/tools` is now `features/print`, and the features of 1.2 declare the services they use.
* [Issue #187](https://github.com/pajoma/vscode-journal/issues/187) Smart-input cold-start latency eliminated. `ScanEntries` now returns the cached entry list on second and subsequent invocations without re-walking the filesystem; cache is invalidated automatically via VS Code file-system events (`onDidCreateFiles`, `onDidDeleteFiles`, `onDidRenameFiles`).
* [Issue #188](https://github.com/pajoma/vscode-journal/issues/188) Maintainability: `var→const` throughout, dead `console.log` removed, `getScopeDefinitions()` and `getNavigationMode()` added to `Configuration`, full `async/await` migration of `conf.ts` (12 wrappers removed), `isRemoteSession()` and `toLocalFileUri()` centralised in `util/paths.ts`, `InsertMemoCommand` consolidated into startup registration.
* Bumped VS Code engine baseline to `^1.118.0` (was `^1.94.0`). `@types/vscode` and toolchain (TypeScript 5.9, ESLint 9.39, esbuild 0.28, `@vscode/test-cli` 0.0.12, `@vscode/test-electron` 2.5, Mocha 11, `@typescript-eslint/*` 8.59) bumped to current stable.
* Migrated translations from the custom `src/ext/messages.json` system to the stable `vscode.l10n` API. Manifest strings live in `package.nls*.json`; runtime strings in `l10n/bundle.l10n*.json`. All 11 locales preserved (en, de, fr, es, it, pt, nl, ru, zh, ja, ar). Fixed a moment.js escape bug in the Spanish locale carried over from `messages.json`.

### Removed
* Redundant `activationEvents` block — implicit activation has covered all `contributes.commands` since VS Code 1.74.
* Unused `@vscode/extension-telemetry` runtime dependency.
* Internal `journal.test` command (was undocumented and never registered).

### Added
* `capabilities.virtualWorkspaces` (`limited`) and `capabilities.untrustedWorkspaces` (`limited` with `restrictedConfigurations: ["journal.base"]`) in the manifest.
* `@vscode/l10n-dev` devDependency and `npm run l10n:export` script for regenerating the runtime bundle.
* Node 22 to the CI matrix alongside Node 20.

## 1.0.2
* [Issue #136](https://github.com/pajoma/vscode-journal/issues/136) Added a configuration option to disable syntax highlighting (disabled by default)
## 1.0.1
* Smaller Bugfixes from release 1.0.0
* A few tweaks for language support
* [Issue #98](https://github.com/pajoma/vscode-journal/issues/98) Add support for more date syntax (`Jun 1` or `dec23`)
* [Issue #122](https://github.com/pajoma/vscode-journal/issues/122) Prefixing the scope in pick lists to simplify filtering
* [Issue #125](https://github.com/pajoma/vscode-journal/issues/122) Added more deprecation warnings in settings
## 1.0.0

* Switching to version 1.0, since it I am using it daily for 5 years now and it seems production ready. 
* Support for scopes has been tested over the last year and is working as intended. See [this explanation](./docs/scopes.md) for details. 
* Added code actions to work with the tasks. You can now complete tasks or copy (shift) them other journal entries.
* [Issue #103](https://github.com/pajoma/vscode-journal/issues/103) Added support for weekly entries 
* [Issue #104](https://github.com/pajoma/vscode-journal/issues/104) Added guidelines to contribute 
* [Issue #102](https://github.com/pajoma/vscode-journal/issues/102), [Issue #101](https://github.com/pajoma/vscode-journal/issues/101) Removed markdown extension for formatting tables
* [Issue #100](https://github.com/pajoma/vscode-journal/issues/100), [Issue #97](https://github.com/pajoma/vscode-journal/issues/97) fixed various issues while syncing notes
* [Issue #91](https://github.com/pajoma/vscode-journal/issues/91) Support for multilines in the settings
* [Issue #77](https://github.com/pajoma/vscode-journal/issues/77) Injecting tasks and memos refactored

## 0.11.2
* [Issue #67](https://github.com/pajoma/vscode-journal/issues/67) Quickfix for typo, which caused configurations to be ignored

## 0.11.0
* Updated dependencies to fix the security vulnerabilities
* Refactured scanning for notes and entries for QuickPickItems. It's now possible to search within all your notes. 
* [Issue #57](https://github.com/pajoma/vscode-journal/issues/57) Label for notes are now denormalized, which makes it easier to search in your notes   
* [Issue #55](https://github.com/pajoma/vscode-journal/issues/55) Whenever we insert a string after a headline, we make sure there is an empty line (to stay markdown compliant)
* [Issue #54](https://github.com/pajoma/vscode-journal/issues/54) Tested the new note dialog
* [Issue #52](https://github.com/pajoma/vscode-journal/issues/52) Fixed two bugs when using date formats in injected strings for tasks and memos
* [Issue #56](https://github.com/pajoma/vscode-journal/issues/56) Removed check for character length for memos


## 0.10.0 
* Updated dependencies to fix the security vulnerabilities
* [Issue #47](https://github.com/pajoma/vscode-journal/issues/47) Changed configuration of shortcuts for printing duration between selected timestamps and the sum of selected numbers, since they interfered with the shortcut for toggling the panel. The shortcuts are now only active when you are in a markdown file and have a multiple selection. Removed the shortcut for printing the time (since it doesn't work with the mentioned workaround). If you need it, find the command 'Journal:Print Time' in your shortcuts settings to enable it again. 
* [Issue #7](https://github.com/pajoma/vscode-journal/issues/7) - Picklist with display of open tasks
* [Issue #8](https://github.com/pajoma/vscode-journal/issues/8) - Picklist with display of recent notes
* [Issue #49](https://github.com/pajoma/vscode-journal/issues/49) - Add warning to settings regarding linebreaks
----

## 0.9.1
* Added support to custom path and filename patterns, see [description of settings](./docs/settings.md) for a description. Completes [issue 18](https://github.com/pajoma/vscode-journal/issues/18) and [issue 20](https://github.com/pajoma/vscode-journal/issues/20)
* Fix for [issue 40](https://github.com/pajoma/vscode-journal/issues/40) (Override of user styles)
* Support for user variables in config settings. This includes a reference to the user's home directory in the base path (see [issue 38](https://github.com/pajoma/vscode-journal/issues/38)) 
* Minor improvements and bug fixes

*Attention*: Don't update the path and file patterns, if you use the vscode-journal-view extension (for now). 

## 0.9
* Added the new command `Print Time` to enter timestamps at cursor position. Shortcut: `Ctrl+J Ctrl+T`. This functionality was originally submitted by @ianmurrays, but didn't make in into the last release. 
* Added the new command `Print elapased hours`, which computes the duration between two seleced timestamps (same format as what "Insert time" prints). Shortcut: `Ctrl+J Ctrl+D`
* Added the new command `Print sum of selected numbers`, which summarizes all selected numbers (I use to see the total time). Shortcut: `Ctrl+J Ctrl+s`
* Added the snippets "task" and "track" (using the table format)
* Activated the markdown extensios for tasks and tables
* [Issue #34](https://github.com/pajoma/vscode-journal/issues/34) Fixed some issues with the syntax highlighting 
* [Issue #32](https://github.com/pajoma/vscode-journal/issues/32) Greatly enhanced the logging (Enable Dev Mode in settings and check Output -> Journal to see what's happening)
* Fixed minor issues with the syntax highlighting
----

## 0.6
* Major refactoring of the codebase to accommodate for the planned scope and flexible paths feature (see [Issue #22](https://github.com/pajoma/vscode-journal/issues/22),  [Issue #18](https://github.com/pajoma/vscode-journal/issues/18),  [Issue #19](https://github.com/pajoma/vscode-journal/issues/19) and  [Issue #20](https://github.com/pajoma/vscode-journal/issues/20)) 
* Syntax highlighting for tasks, keywords and tags (see [Issue #18](https://github.com/pajoma/vscode-journal/issues/18)) 
* New setting to control if pages are open in columns or not (see [Issue #23](https://github.com/pajoma/vscode-journal/issues/23))
* Cursor will now be placed to the end of the opened file to start typing right away (see [Issue #30](https://github.com/pajoma/vscode-journal/issues/30))
* Github user @Gruntfuggly has [created a view for vscode-journal](https://github.com/Gruntfuggly/vscode-journal-view), thanks a lot for this (see [Issue #18](https://github.com/pajoma/vscode-journal/issues/18)). Here's the [extension](https://marketplace.visualstudio.com/items?itemName=Gruntfuggly.vscode-journal-view). 

----

### 0.5.0
* Interact with markdown file (ctrl+click) to follow internal links (standard feature of vscode)
* [Issue #6](https://github.com/pajoma/vscode-journal/issues/6) - Linking journal pages with notes
* Fixed smaller bugs
* New configuration options for controlling where memos, tasks, etc. are injected


----

### 0.4.3 (Hotfix)
* Fixed a bug in path resolution  
[Attention]: This bug has been in the released version between 2016-12-29 and 2017-01-04. The last bit of the path was ignored. If your base directory has been "/users/a/b/c", new files have been created in "/users/a/b/2017/01", not in "/users/a/b/c/2017/01". Move your files into the correct folder, otherwise you have to merge by hand. 


### 0.4.2

#### Fixes
* Updated code due to changes in extension API
* Adressed [Issue #10](https://github.com/pajoma/vscode-journal/issues/10) 
* Adding license information  

### 0.4.1

####Fixes
* Refactored code to ease detection of [Issue #9](https://github.com/pajoma/vscode-journal/issues/9) 


### 0.4
#### Enhancements  
* [Issue #4](https://github.com/pajoma/vscode-journal/issues/4) - New command `journal:open`
* Cleaned up code
* [Issue #3](https://github.com/pajoma/vscode-journal/issues/3) - Enhanced memo command, supporting tasks now

#### Fixes
* [Issue #5](https://github.com/pajoma/vscode-journal/issues/5)


----

## 0.3

### Enhancements
- [Issue #1](https://github.com/pajoma/vscode-journal/issues/1) - New command `journal:day` to open a specific day (see Readme)
- Keybindings `ctrl+shift+j` to call this command
- [Issue #2](https://github.com/pajoma/vscode-journal/issues/2) - Update setting tpl, removing the whitespace 
