# Journal Configuration

Many parameters of the journal can be configured through the internal settings of Visual Studio Code. See [this page](https://code.visualstudio.com/docs/getstarted/settings) for a general introduction.

The only mandatory setting is the base path. See the bottom of this page for a screen capture showing how to change it.

Before you change a setting, think about whether you want to store it in your user settings or workspace settings.
* If your current workspace is synced across different devices and you want the setting to be used on different machines (e.g. syntax highlighting and templates), put the options into your workspace settings.
* If the settings are specific to your environment (e.g. directories), put them into your user settings (which are stored in your local user profile).

## Workspace and virtual workspace support

vscode-journal writes files to the directory configured in `journal.base`. In an **untrusted workspace** `journal.base` workspace-level overrides are ignored — the user-level value is used instead, so workspace settings cannot redirect your journal to an untrusted path.

In a **virtual workspace** (e.g. GitHub Codespaces or Remote SSH with a virtual FS provider), write operations to local paths are unavailable. Read-only browsing of existing entries may still work, but creating new entries or notes requires a local workspace.

## Template variables

Some settings support the following variables:

* `${homeDir}` — the current user's home directory via Node's `os.homedir()`. Resolves to `$HOME` on Linux / Mac and `%USERPROFILE%` on Windows.
* `${input}` — a string entered by the user in the smart input dialog.
* `${year}` — current year as a four-digit number.
* `${month}` — current month as a two-digit number.
* `${day}` — current day as a two-digit number.
* `${week}` — current ISO week number (1–53).
* `${weekday}` — name of the current day of the week.
* `${localDate}` — locale-formatted date (e.g. `September 4, 1986`).
* `${localTime}` — locale-formatted time (e.g. `8:30 PM`).
* `${d:...}` — custom date format using [Moment.js display format](https://momentjs.com/docs/#/displaying/format/), for example `${d:dddd, MMMM Do YYYY}`.


## Directories

### Base directory

* Key: `journal.base`
* Default: directory `Journal` in the current user's home directory (`${homeDir}/Journal`).
* Supported variables: `${homeDir}`

`${homeDir}` resolves to `$HOME` on Linux and Mac and to `%USERPROFILE%` on Windows. Example:

```json
"journal.base": "${homeDir}/Documents/Journal"
```

Note: in an untrusted workspace, any workspace-level override of `journal.base` is ignored; the user-level value is always used (see "Workspace and virtual workspace support" above).

### Path Patterns for notes and journal entries

* Key: `journal.patterns`
* Supported variables: `${base}`, `${year}`, `${month}`, `${day}`, `${week}`, `${input}`, `${ext}`

The location of all files created within the base directory are configured using individual patterns:

```json
"journal.patterns": {
    "notes": {
        "path": "${base}/${year}/${month}/${day}",
        "file": "${input}.${ext}"
    },
    "entries": {
        "path": "${base}/${year}/${month}",
        "file": "${day}.${ext}"
    },
    "weeks": {
        "path": "${base}/${year}",
        "file": "week_${week}.${ext}"
    },
    "weeklyNotes": {
        "path": "${base}/${year}/w${week}",
        "file": "${input}.${ext}"
    }
}
```

| Pattern key | Used when |
|---|---|
| `notes` | Creating a note with `journal.note` (daily granularity) |
| `entries` | Creating or opening a daily journal entry |
| `weeks` | Creating or opening a weekly journal entry |
| `weeklyNotes` | Creating a note with `journal.note` when `journal.entryGranularity = "weekly"` |

This configuration is only valid for the default scope. Scoped notes use scope-specific patterns if configured (see [Scopes](./scopes.md)).

### Changing the layout

* Key: `journal.patternHistory`
* Default: `[]`

When you change `journal.patterns` (or `journal.ext`), the files written before stay where they are. Add the old patterns to `journal.patternHistory`, newest first, and the journal still finds them:

```json
"journal.patterns": {
    "entries": { "path": "${base}/${year}", "file": "${year}-${month}-${day}.${ext}" }
},
"journal.patternHistory": [
    {
        "until": "2026-10-20",
        "patterns": {
            "entries": { "path": "${base}/${year}/${month}", "file": "${day}.${ext}" }
        }
    }
]
```

* Each entry holds the `patterns` as they were set in `journal.patterns`; unset ones are the defaults. Set `ext` if the file extension was different. `until` is the day the patterns were replaced, for your reference.
* The default patterns always count as the oldest layout, so a journal that started with the defaults needs no entry for them.
* Opening a day (smart input, **Today**, the MCP server) opens its entry where it is: in the current layout, else in the first earlier layout that has it. Only a day without an entry in any layout gets a new entry, in the current layout. The same applies to weekly entries.
* Previous/next navigation, the entry and note lists, the search, the daily links of a weekly entry and the notes linked from an entry include the files of every layout.
* A scope has its own `patternHistory` in its `journal.scopes` entry; `journal.patternHistory` is for the default scope only.

#### Moving the files to the current layout

**Journal: Migrate to Current Layout** (`journal.migrateLayout`) moves the files of the earlier layouts to where the current patterns put them:

1. Choose what to move: daily and weekly entries (preselected) and notes. Only notes named by the notes pattern (e.g. `${input}.${ext}`) are moved; other files in the notes folders, such as images, stay where they are, and the links to them are updated.
2. A preview lists every file and its target. A file whose target exists already (the day has an entry in the current layout too) is never overwritten: it is listed and stays where it is, merge the two by hand.
3. After you confirm, the files are moved and the relative links in all journal files are updated: links to a moved file, and the links of a moved file to the files around it. Folders left empty are removed. In a git repository the moves show up as renames.
4. If an earlier layout of `journal.patternHistory` has no files left, the command offers to remove it from the setting.

Save open journal files before you run it.


## Templates

Templates configure how text within generated files is formatted.

* Key: `journal.templates`

The default is:

```json
"journal.templates": [
    {
        "name": "memo",
        "template": "- MEMO ${localTime}: ${input}"
    },
    {
        "name": "task",
        "template": "- [] ${d:LL} - Task: ${input}",
        "after": "## Tasks"
    },
    {
        "name": "entry",
        "template": "# ${d:dddd, MMMM DD YYYY}\n\n## Tasks\n\n## Notes\n\n"
    },
    {
        "name": "time",
        "template": "${localTime}"
    },
    {
        "name": "note",
        "template": "# ${input}\n\n${tags}\n"
    },
    {
        "name": "files",
        "template": "- NOTE: [${title}](${link})",
        "after": "## Notes"
    },
    {
        "name": "weekly",
        "template": "# Week ${week}\n\n## Tasks\n\n## Notes\n\n## Daily Entries\n\n"
    },
    {
        "name": "dailyLink",
        "template": "- [${weekday}, ${d:MMMM DD}](${link})",
        "after": "## Daily Entries"
    }
]
```

Each entry has:
* `name` — identifier used internally and in `journal.tpl-*` legacy keys.
* `template` — the string to insert. Supports all template variables listed above.
* `after` (optional) — heading string after which new content is inserted. Must match the heading exactly as it appears in the file.

### Template Entries

* Key: `journal.templates["entry"].template`
* Supported variables: `${year}`, `${month}`, `${day}`, `${ext}`, `${weekday}`, `${localDate}`, `${localTime}`, `${d:}` (custom)

The default entry template generates:

```markdown
# Tuesday, September 25, 2018

## Tasks

## Notes
```

To add a new `## Memos` section, override both `memo` and `entry`:

```json
"journal.templates": [
    {
        "name": "memo",
        "template": "- Memo: ${input} (created: ${localTime})",
        "after": "## Memos"
    },
    {
        "name": "entry",
        "template": "# ${d:dddd, MMMM DD YYYY}\n\n## Tasks\n\n## Memos\n\n## Notes\n\n"
    }
]
```

Make sure the value in `after` matches the generated heading in the entry template exactly.

### Notes

* Key: `journal.templates["note"].template`
* Supported variables: `${input}`, `${year}`, `${month}`, `${day}`, `${weekday}`, `${localDate}`, `${localTime}`, `${d:}` (custom)

### Memos

* Key: `journal.templates["memo"].template`
* Supported variables: `${input}`, `${year}`, `${month}`, `${day}`, `${weekday}`, `${localDate}`, `${localTime}`, `${d:}` (custom)

---

* Key: `journal.templates["memo"].after`
* Default: none (inserts at the top of the entry)

The `after` flag tells the extension where to place the new line in an existing entry. It searches for the configured string and inserts the new content directly after it.

### Tasks

* Key: `journal.templates["task"].template`
* Supported variables: `${input}`, `${year}`, `${month}`, `${day}`, `${weekday}`, `${localDate}`, `${localTime}`, `${d:}` (custom)

---

* Key: `journal.templates["task"].after`
* Default: `## Tasks`

### File Links

Which files are linked is set by `journal.notes.ignore`, see [Notes](./notes.md).


* Key: `journal.templates["files"].template`
* Default: `- NOTE: [${title}](${link})`
* Supported variables:
  * `${title}` — title of the linked file (extracted from the file name)
  * `${link}` — relative path to the file

---

* Key: `journal.templates["files"].after`
* Default: `## Notes`

### Weekly entries

* Key: `journal.templates["weekly"].template`

The default weekly template includes a `## Daily Entries` heading, which is used by the [weekly sync](#weekly-sync) feature to maintain an automatic list of links to daily entries. See [Weekly Entries](./weekly-entries.md) for the full workflow.

#### Dates of the week in the weekly template

* Key: `journal.weeklyTemplateDates`
* Default: `false`

By default, only `${week}` is replaced in the weekly template. With `"journal.weeklyTemplateDates": true`, the date variables are resolved as well, counted from the first day of the week (Monday or Sunday, depending on `journal.locale`):

* `${d:format}`, `${localDate}`, `${weekday}`, `${month}`, `${day}`: the first day of the week
* `${d+1:format}` … `${d+6:format}`: the following days
* `${year}`: the year the week belongs to, which can differ from the calendar year around New Year

Example, to prepare every day of the week:

```json
"journal.weeklyTemplateDates": true,
"journal.templates": [
  {
    "name": "weekly",
    "template": "# Week ${week}/${year}\n\n## ${d+0:dddd, DD.MM.}\n\n## ${d+1:dddd, DD.MM.}\n\n## ${d+2:dddd, DD.MM.}\n\n## ${d+3:dddd, DD.MM.}\n\n## ${d+4:dddd, DD.MM.}\n\n## Daily Entries\n\n"
  }
]
```

The MCP server reads the same setting and creates weekly entries identically.

### Daily links (weekly sync)

* Key: `journal.templates["dailyLink"].template`
* Default: `- [${weekday}, ${d:MMMM DD}](${link})`
* `after`: `## Daily Entries`

Used by the weekly sync to render each daily-entry link inside the `## Daily Entries` block.

## Legacy template keys

The following individual keys predate the unified `journal.templates` array. Both mechanisms are supported, but `journal.templates` is preferred for new or updated configuration.

| Key | Purpose |
|-----|---------|
| `journal.tpl-entry` | Template string for daily journal entries |
| `journal.tpl-time` | Template string for inserting the current time |
| `journal.tpl-note` | Template string for notes |
| `journal.tpl-memo` | Template string for new memos |
| `journal.tpl-memo-after` | Heading after which memos are inserted |
| `journal.tpl-task` | Template string for new tasks |
| `journal.tpl-task-after` | Heading after which tasks are inserted |
| `journal.tpl-todo` | Template string for new todos |
| `journal.tpl-todo-after` | Heading after which todos are inserted |
| `journal.tpl-files` | Template for file links injected into entries |
| `journal.tpl-files-after` | Heading after which file links are inserted |

**Migration:** Move the value from `journal.tpl-memo` into the `template` field of the `"memo"` entry in `journal.templates`, and do the same for other keys. Example:

```json
// Before (legacy)
"journal.tpl-memo": "- MEMO: ${input}",
"journal.tpl-memo-after": "## Memos"

// After (preferred)
"journal.templates": [
    { "name": "memo", "template": "- MEMO: ${input}", "after": "## Memos" }
]
```

Both can coexist; `journal.templates` takes precedence for any name that appears in both.


## Syntax highlighting

Tasks, memos and `#scopes` are colored by your color theme: open boxes like keywords, done and moved tasks like comments, bullets like other list bullets. This works in light, dark and high contrast themes and follows theme switches. The setting `journal.syntax-highlighting` is no longer used.

To choose your own colors, add rules for the journal scopes to `editor.tokenColorCustomizations` in your user settings; they take precedence over the theme:

```json
"editor.tokenColorCustomizations": {
    "textMateRules": [
        { "scope": "text.html.markdown.journal.task.open.marker", "settings": { "foreground": "#CC3300" } },
        { "scope": "text.html.markdown.journal.task.completed.text", "settings": { "fontStyle": "strikethrough" } }
    ]
}
```

Scopes: `text.html.markdown.journal.task.{open,completed,shifted}.{bullet,marker,keyword,text}`, `text.html.markdown.journal.memo.{bullet,keyword}` and `text.html.markdown.journal.scope`. Older versions wrote such rules into your user settings themselves; they are removed on startup unless you changed them.


## Scopes

* Key: `journal.scopeRoot`
* Default: `${base}/scopes`
* Supported variables: `${base}`, `${homeDir}`, `${workspaceRoot}`, `${workspaceFolder}`

Every folder below the scope root is a scope. Relative paths are relative to `journal.base`. Create scopes with **Journal: Create Scope**.

* Key: `journal.scopes`
* Default: `[]`
* Supported variables: see individual keys

Configured scopes: adds scopes or overrides a folder scope's base, notes pattern and templates. By entering a scope tag in a note title, the extension stores the note in the scope.

See more details [here](./scopes.md).


## Other options

### File extension

* Key: `journal.ext`
* Default: `md` (Markdown)
* Supported variables: none

### Locale

*Deprecated — the extension falls back to the display locale configured in your editor.*

* Key: `journal.locale`
* Default: `en-US`
* Supported variables: none

### Development mode

* Key: `journal.dev`
* Default: `false`
* Supported variables: none

Enables verbose logging in the Output channel. Useful for diagnosing unexpected behavior. In some versions it may also activate experimental features.

### Split Pane Mode

* Key: `journal.openInNewEditorGroup`
* Default: `false`
* Supported variables: none

Controls whether new files open in full mode or in a new editor group (split pane).

### MCP Server

* Key: `journal.mcp.enabled`
* Default: `false`
* Supported variables: none
* User settings only

Starts the bundled journal MCP server, so AI assistants can read and write your journal. GitHub Copilot (agent mode) finds it without setup, other assistants are set up with **Journal: Set up MCP Server**. When off, the server does not start, also for assistants set up before. See [MCP](./mcp.md).

### Search

The journal search (row *Search journal* in the smart input, command **Journal: Search Journal**), see [Search the journal](./smartInput.md#search-the-journal). Changes apply right away.

| Key | Default | Values |
|-----|---------|--------|
| `journal.search.enabled` | `true` | Off: no search row, the command only says that the search is off, and the journal is not read for the search. |
| `journal.search.indexOnStartup` | `local` | `local`: build the index in the background a few seconds after VS Code starts, except in remote sessions (SSH, WSL, containers). `always`: also in remote sessions. `never`: build it when the search opens for the first time. |
| `journal.search.content` | `true` | Search the text of entries and notes. Off: titles only; the files are not read and the search uses less memory. |
| `journal.search.recency` | `default` | How much newer files are preferred among similar matches: `off` (relevance only), `low`, `default`, `high`. The date is the day a file belongs to, not its modification date. |
| `journal.search.maxResults` | `100` | The maximum number of results. |

### Navigation Mode

* Key: `journal.navigation.mode`
* Default: `existing`
* Allowed values: `existing`, `calendar`

Controls how the `Open Previous Journal Entry` (`Ctrl+J ,`) and `Open Next Journal Entry` (`Ctrl+J .`) commands step through entries.

| Value | Behavior |
|-------|----------|
| `existing` *(default)* | Find the previous / next entry that already exists on disk. Skips gaps (weekends, vacations). At the start or end of history an info toast is shown and the editor does not change. |
| `calendar` | Step exactly one calendar day back or forward from the anchor file. Creates the target entry if missing (same as `Open Yesterday` / `Open Tomorrow`). |

The anchor is the currently open journal entry. When no journal file is open, the anchor falls back to today. Navigation honors the active scope — derived from the anchor file's path or the default scope when no anchor file is open.

### Entry Granularity

* Key: `journal.entryGranularity`
* Default: `daily`
* Allowed values: `daily`, `weekly`

Controls where quick memos, tasks, and new notes go when you have not typed an explicit date target into the smart input.

| Value | Behavior |
|-------|----------|
| `daily` *(default)* | Memos / tasks inject into today's daily entry; new notes land under `journal.patterns.notes`. |
| `weekly` | Memos / tasks inject into the current ISO week's weekly entry; new notes land under `journal.patterns.weeklyNotes`. |

Explicit date input always overrides this setting. `+0 task ...` still goes to today, `2026-05-13 memo: ...` still goes to that date, `w20 task ...` still goes to week 20.

When you switch to `weekly`, make sure the `journal.templates` entry named `weekly` includes the `## Tasks` and `## Notes` section headings — the default template already does this.

Known limitations:
- Granularity is a global setting in this release. Per-scope override is not yet supported.
- Switching granularity does not move files already on disk; both layouts can coexist.

### Weekly Sync

* Key: `journal.weeklySync`
* Default: `{ "enabled": true, "anchor": "## Daily Entries", "template": "- [${weekday}, ${d:MMMM DD}](${link})", "sortOrder": "ascending" }`

When a weekly entry is the active editor, the extension automatically maintains a list of links to every daily entry that exists within the same ISO week, keeping the block up to date as daily files are created or deleted.

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | Set to `false` to disable the feature entirely — no edits, no watcher. |
| `anchor` | `## Daily Entries` | The exact heading line the sync searches for. Add this heading to your weekly template if you customized it. Files without the anchor are left untouched. |
| `template` | `- [${weekday}, ${d:MMMM DD}](${link})` | Template for each link line. Supports `${weekday}`, `${d:...}`, `${link}`, `${title}`. |
| `sortOrder` | `ascending` | `ascending` = Monday → Sunday. `descending` = Sunday → Monday. |

The default `weekly` template ships with the `## Daily Entries` heading. If you have customized your weekly template and want to opt in, add `## Daily Entries` as a separate section heading. Weekly files without the anchor are silently skipped.

→ See [Weekly Entries](./weekly-entries.md) for the full weekly workflow.

![Screen Capture](./set-base-directory.gif)
