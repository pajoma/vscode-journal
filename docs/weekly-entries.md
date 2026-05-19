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

When a weekly entry is the active editor, the extension automatically maintains a `## Daily Entries` block that lists links to every daily entry in the same ISO week.

**How it works:**
1. The extension searches the open weekly file for the line configured in `journal.weeklySync.anchor` (default: `## Daily Entries`).
2. It scans the journal directory for daily entries in the same ISO week.
3. It replaces the content after the anchor with a sorted list of links, using the `journal.weeklySync.template` format.
4. The list is refreshed whenever a daily file is created or deleted in the background.

**Anchor requirement:** The anchor heading must appear verbatim in your weekly template. The default `weekly` template ships with `## Daily Entries`. If you customized your weekly template, add `## Daily Entries` as a separate section heading to opt in.

**Graceful degradation:** Weekly files that do not contain the anchor heading are silently skipped — no error, no edit.

## Customization

All sync behavior is controlled by `journal.weeklySync`:

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | Set to `false` to disable sync entirely. |
| `anchor` | `## Daily Entries` | Heading the sync searches for. |
| `template` | `- [${weekday}, ${d:MMMM DD}](${link})` | Template for each link. Supports `${weekday}`, `${d:...}`, `${link}`, `${title}`. |
| `sortOrder` | `ascending` | `ascending` = Monday → Sunday; `descending` = Sunday → Monday. |

Example — descending order with ISO date:

```json
"journal.weeklySync": {
    "enabled": true,
    "anchor": "## Daily Entries",
    "template": "- [${d:YYYY-MM-DD} ${weekday}](${link})",
    "sortOrder": "descending"
}
```

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
