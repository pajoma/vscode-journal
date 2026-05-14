# Spec — Feature #185: Weekly Page Auto-Sync of Daily Entry Links

**Issue:** [pajoma/vscode-journal#185](https://github.com/pajoma/vscode-journal/issues/185)
**Branch:** `168-possible-to-use-weekly-instead-of-daily-for-memos-ect` (bundled with #168 per user direction)
**Date:** 2026-05-14
**Status:** Draft — awaiting approval on issue.

## Goal

When a weekly entry is opened (or when a daily entry inside the same ISO week changes on disk while the weekly is the active editor), automatically inject and keep up to date a list of links to every daily entry that exists for the week's days. Sync is one-directional: daily files are the source of truth, the weekly page reflects them.

## Why now

#168 makes weekly entries the default routing target for memos / tasks / notes. A user who adopts weekly granularity still occasionally writes daily entries (explicit `+0`, `yesterday`, `2026-05-13`, etc.). Without a navigable index in the weekly page, those daily entries become hidden. This feature gives the weekly view a maintained table of contents pointing to the same week's daily files, so the weekly workflow stays cohesive without giving up daily entries entirely.

The plumbing exists by analogy: `SyncNoteLinks` (`src/provider/features/sync-note-links.ts`) already maintains a list of links from a daily entry to its notes folder. We mirror that pattern into a new `SyncDailyLinks` feature that maintains links from a weekly entry to its daily files.

## In scope

- New feature `src/provider/features/sync-daily-links.ts` that, given a `TextDocument` whose path matches a configured weekly entry pattern, scans the journal base for daily files within the same ISO week, builds a deduplicated list of link lines from a configurable template, and injects / replaces them under a configured anchor section in the weekly file.
- New configuration block `journal.weeklySync` controlling the feature:
  - `enabled`: boolean, default `true`.
  - `anchor`: string, default `"## Daily Entries"`.
  - `template`: inline template string; default `"- [${weekday}, ${d:MMMM DD}](${link})"`.
  - `sortOrder`: `"ascending"` (Mon → Sun, default) or `"descending"` (Sun → Mon).
- New default template entry `dailyLink` inside `journal.templates`, mirroring how `files` works for notes (template + `after` anchor). The `after` anchor for `dailyLink` defaults to the value of `journal.weeklySync.anchor`.
- Update default `weekly` template in `journal.templates` to ship with the `## Daily Entries` heading appended after `## Notes`, so the anchor is present in newly-created weekly files. The template becomes `"# Week ${week}\n\n## Tasks\n\n## Notes\n\n## Daily Entries\n\n"`.
- Hook the sync into the weekly entry open flow: after `Reader.loadEntryForWeek` returns a document and the existing #168 injection has run, call `SyncDailyLinks.sync(doc, week, year)` to populate the section.
- File-system watcher with a narrow scope: register a `FileSystemWatcher` over the configured daily entry path for the current week while a weekly entry is the active editor. On create / change / delete events inside that range, re-run the sync (debounced). When the active editor changes to a non-weekly file, dispose the watcher.
- Idempotent rendering: when the anchor section already contains link lines, the sync should compute the exact target block (sorted, deduplicated) and replace the entire block under the anchor (up to the next markdown heading or end of file). It should not append duplicates or scramble user-typed content outside the block.
- Tests covering golden path, idempotency, missing-anchor warning, create + delete during session, sort order both directions, and `enabled=false` disabling the feature.
- Docs: short paragraph in `docs/settings.md` (under "Other options") explaining `journal.weeklySync`; new section in `docs/notes.md` or a new file under `docs/` describing the auto-sync behavior.

## Out of scope

- Two-way sync. Daily files are never modified by this feature; only the weekly file is touched.
- Cross-week aggregation. A weekly file only ever lists its own ISO week's days.
- Cross-scope aggregation. The sync uses the **anchoring weekly file's scope** (derived from its path; falls back to the default scope) and lists daily entries from that same scope only.
- Sorting by anything other than weekday. (No custom sort key per v1.)
- Custom template variables beyond `${weekday}`, `${d:...}`, `${link}`, `${title}`. The existing template substitution helpers already cover these.
- Migration: weekly files that already exist on disk without the `## Daily Entries` anchor are left alone. The sync logs a warning the first time it encounters such a file and skips the inject. Users can add the anchor manually to opt in.
- Real-time editor-side observation of unsaved changes in daily files. The watcher fires on FS events, which are good enough for create / rename / delete (the modal user behavior the issue calls out).

## Acceptance criteria

1. Opening a weekly entry with three existing daily files (Mon, Wed, Fri of that ISO week) results in three link lines under the `## Daily Entries` section in the weekly file, in ascending weekday order, using the configured template.
2. Re-opening the same weekly entry without any disk changes produces no edits — the existing block is detected as already-correct and the file is left untouched (idempotent).
3. Creating a new daily file (e.g., for Thursday of the same week) while the weekly entry is the active editor adds a fourth line to the block within the debounce window (≤ 500ms after the FS event).
4. Deleting an existing daily file while the weekly is active removes the corresponding line from the block.
5. With `journal.weeklySync.enabled = false`, opening a weekly entry leaves the file untouched even if the anchor is present. No watcher is registered.
6. If the weekly file does not contain the configured anchor heading, the sync skips silently (logs a debug-level message) — no inject, no error toast.
7. With `journal.weeklySync.sortOrder = "descending"`, the order is Sun → Mon.
8. Changing the active editor away from a weekly entry disposes any registered file-system watcher (verified by `Disposable` count in tests, or by an explicit teardown assertion).
9. The default `weekly` template in `package.json` ships with the `## Daily Entries` heading present.
10. `npm run check` (lint + compile + test) passes; all existing tests stay green.

## Entities / contracts / interfaces

### Settings (manifest)

```jsonc
"journal.weeklySync": {
  "type": "object",
  "default": {
    "enabled": true,
    "anchor": "## Daily Entries",
    "template": "- [${weekday}, ${d:MMMM DD}](${link})",
    "sortOrder": "ascending"
  },
  "description": "%configuration.journal.weeklySync.description%"
}
```

```jsonc
// journal.templates additions:
{ "name": "dailyLink", "template": "- [${weekday}, ${d:MMMM DD}](${link})", "after": "## Daily Entries" }
```

```jsonc
// updated default weekly template (additive to #168):
{ "name": "weekly", "template": "# Week ${week}\n\n## Tasks\n\n## Notes\n\n## Daily Entries\n\n" }
```

### Configuration helpers

```typescript
type WeeklySyncConfig = {
  enabled: boolean;
  anchor: string;
  template: string;
  sortOrder: "ascending" | "descending";
};

class Configuration {
  public getWeeklySyncConfig(_scopeId?: string): WeeklySyncConfig;
  public async getDailyLinkInlineTemplate(_scopeId?: string): Promise<InlineTemplate>;
}
```

### Sync feature

```typescript
// src/provider/features/sync-daily-links.ts
export class SyncDailyLinks {
  constructor(public ctrl: J.Util.Ctrl) {}

  public async sync(weeklyDoc: vscode.TextDocument, week: number, year: number, scope?: string): Promise<void>;

  // Returns the absolute file URIs of existing daily entries for the week,
  // sorted by date ascending. Caller may reverse for descending sort.
  public async findDailyEntriesForWeek(week: number, year: number, scope?: string): Promise<vscode.Uri[]>;

  // Renders the template-driven block (no I/O); pure given the URIs.
  public async renderBlock(weeklyDoc: vscode.TextDocument, dailies: vscode.Uri[], scope?: string): Promise<string>;

  // Replaces (or inserts) the anchored block in the doc. Returns true if the file changed.
  public async applyBlock(weeklyDoc: vscode.TextDocument, anchor: string, block: string): Promise<boolean>;
}
```

### Watcher lifecycle

```typescript
// src/provider/features/weekly-entry-watcher.ts
export class WeeklyEntryWatcher implements vscode.Disposable {
  // Registered once in Startup.registerCommands (or a dedicated step).
  // Listens to vscode.window.onDidChangeActiveTextEditor.
  // When the active editor's URI matches the weekly file pattern for any
  // scope, derives (week, year, scope), runs SyncDailyLinks.sync, and
  // registers a narrow FileSystemWatcher over the week's days. Disposes
  // the previous watcher (if any) on every transition.
}
```

### URI → week resolution

The watcher needs to recognize a weekly file from its path. Reuse `getDateFromURIAndConfig` (already used by #144 navigation) for daily entries, plus a new sibling `getWeekFromURIAndConfig` that matches the weekly path pattern (`${base}/${year}/week_${week}.${ext}` per default) and extracts `{week, year, scope}`. Both functions live in `src/util/paths.ts`.

## Constraints

- **Backwards compatibility:** existing users who have customized their weekly template without the `## Daily Entries` heading keep their template untouched. The sync logs a single debug message and skips. The default weekly template change only affects new installations / users who reset to default.
- **Performance:** the FS watcher must be scoped to the current week's day paths only. A watcher over the entire base directory would re-trigger on every unrelated edit (notes, other weeks). Use a glob like `${base}/${year}/${month}/0[1-7].md` plus targeted globs for the specific dates of the active week.
- **Idempotency:** the rendered block uses deterministic ordering (sort by date ascending or descending per setting) so repeated invocations produce identical text. The anchor + next-heading boundary determines the replace range.
- **No moment dependency added:** reuse the existing `moment` ISO week helpers already wrapped in `src/util/dates.ts` (`getCurrentISOWeek`, `getISOWeekYear` from #168) plus a new `getDatesOfISOWeek(week, year)` returning `Date[7]` for the Mon → Sun range.
- **Save bursts:** debounce FS events with a 500ms tail-window so a rapid create + rename produces a single sync call.

## Open questions

None blocking. The exact wording of the warning log when anchor is missing, and whether to expose `journal.weeklySync.warnOnMissingAnchor` as a separate toggle, can be deferred until first user feedback.

## Related issues

- **Builds on:** #168 (entry granularity) — the default weekly template change is layered on top of #168's `## Tasks` / `## Notes` additions, producing the final shape `"# Week ${week}\n\n## Tasks\n\n## Notes\n\n## Daily Entries\n\n"`.
- **Related:** #103 (original weekly entry feature), `SyncNoteLinks` (the reference implementation pattern).
- **Bundled:** ships in the same branch and PR as #168.

## Notes for the implementer

- The watcher should NOT inject on `onDidChangeTextDocument`. The user typing inside the weekly file must not retrigger sync (would race with their cursor). FS events only.
- When parsing the existing block under the anchor, treat the anchor as `^${anchor}\s*$` and the end as the next markdown heading at the same or higher level (`/^#+\s/`). Do not rely on a known fixed number of lines.
- When replacing the block, preserve a single blank line after the anchor and a single blank line before the next heading, so the file remains markdown-tidy.
- The watcher's lifecycle is per-editor, not per-document. Two editors on the same weekly file should NOT register duplicate watchers (key the registration map by `doc.uri.toString()`).
