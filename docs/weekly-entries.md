# Weekly Entries

Weekly entries are journal files that cover an entire ISO week rather than a single day. They are useful for week-level planning, retrospectives, and tracking tasks that span multiple days.

## Opening a weekly entry

Type a week reference in the smart input (`Ctrl+Shift+J`):

* `w20` — opens week 20 of the current year.
* `w20 task Buy groceries` — opens week 20 and injects a task.
* `w20 memo: Stand-up notes` — opens week 20 and injects a memo.

The file is created at `journal.patterns.weeks` if it does not exist (default: `${base}/${year}/week_${week}.${ext}`).

## Entry granularity

Set `journal.entryGranularity = "weekly"` to make bare smart input (without an explicit date) go to the current week's entry instead of today's daily entry.

| Granularity | Where memos / tasks land (no explicit date) |
|---|---|
| `daily` *(default)* | Today's daily entry |
| `weekly` | Current ISO week's weekly entry |

Explicit date overrides still work in both modes: `+1 task ...` goes to tomorrow, `w20 task ...` always goes to week 20.

When using weekly granularity, notes created without an explicit date land under `journal.patterns.weeklyNotes` (default: `${base}/${year}/w${week}/${input}.${ext}`).

See [Settings → Entry Granularity](./settings.md#entry-granularity) for the full reference.

## Daily Entries auto-sync

When a weekly entry is the active editor, the extension automatically maintains a `## Daily Entries` block that links the days of the week: by default the working days, Monday to Friday, as [wiki links](./notes.md#wiki-links) (`- [[2026-10-19|Monday, October 19]]`), and the weekend days that have an entry. Ctrl+click on a day without entry creates it.

**How it works:**
1. The extension searches the open weekly file for the line configured in `journal.weeklySync.anchor` (default: `## Daily Entries`).
2. It scans the journal directory for daily entries in the same ISO week.
3. It replaces the content after the anchor with a sorted list of links, using the `dailyLink` template of `journal.templates`. A template with `${link}` (a markdown link) lists only the days that have an entry.
4. The list is refreshed whenever a daily file is created or deleted in the background.

**Dates of the week:** Directly under the title, the sync keeps a line with the first and the last day of the week, e.g. `06-22 .. 06-28` (the week starts on Monday or Sunday, depending on `journal.locale`).

**Position:** The section is always the first one under the title of the weekly entry (lines right under the title, such as memos, stay above it). A weekly entry without the section gets it there, and a section further down is moved up. The default `weekly` template starts with it: `# Week ${week}`, `## Daily Entries`, `## Tasks`, `## Notes`. Set `journal.weeklySync.enabled` to `false` to keep your weekly entries untouched.

## Customization

All sync behavior is controlled by `journal.weeklySync`:

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | Set to `false` to disable sync entirely. |
| `anchor` | `## Daily Entries` | Heading the sync searches for. |
| `template` | `- [[${d:YYYY-MM-DD}\|${weekday}, ${d:MMMM DD}]]` | Not used: the lines come from the `dailyLink` template of `journal.templates` (same variables: `${weekday}`, `${d:...}`, `${link}`, `${title}`). |
| `sortOrder` | `ascending` | `ascending` = Monday → Sunday; `descending` = Sunday → Monday. |

Example — descending order:

```json
"journal.weeklySync": {
    "enabled": true,
    "anchor": "## Daily Entries",
    "sortOrder": "descending"
}
```

The format of each line is the `dailyLink` template in `journal.templates`, see [Settings → Daily links](./settings.md#daily-links-weekly-sync).

See [Settings → Weekly Sync](./settings.md#weekly-sync) for the full reference.

## Disabling sync

Set `journal.weeklySync.enabled = false` in your user or workspace settings:

```json
"journal.weeklySync": {
    "enabled": false
}
```

The extension will not watch for daily file changes and will never modify weekly files.

## File pattern

The path for weekly note files (created when `journal.entryGranularity = "weekly"` and a note is added without an explicit date) is controlled by `journal.patterns.weeklyNotes`.

Default:
```json
"weeklyNotes": {
    "path": "${base}/${year}/w${week}",
    "file": "${input}.${ext}"
}
```

See [Settings → Path Patterns](./settings.md#path-patterns-for-notes-and-journal-entries) for the full reference.

---

→ [Commands](./commands.md) · [Settings](./settings.md)
