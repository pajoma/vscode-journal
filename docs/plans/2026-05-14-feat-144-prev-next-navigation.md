# Issue #144 — Implementation Plan: Open Previous / Open Next entry navigation

> **Spec:** [docs/specs/2026-05-14-feat-144-prev-next-navigation.md](../specs/2026-05-14-feat-144-prev-next-navigation.md)
> **Issue:** [pajoma/vscode-journal#144](https://github.com/pajoma/vscode-journal/issues/144)
> **Branch:** `144-journal-open-previous-and-open-next-feature`
> **Created:** 2026-05-14

## Approach

Build the feature in three thin layers:

1. **Pure navigation logic** in a new module `src/actions/navigation.ts`. Two exported functions:
   - `resolveAnchor(ctrl, editor) → { date, scope }` — parses the active editor's URI via `getDateFromURIAndConfig`. Falls back to `{ today, SCOPE_DEFAULT }` on any failure.
   - `findAdjacentEntry(ctrl, anchor, direction, mode) → Date | null` — for `mode: 'calendar'` it returns `anchor.date ± 1d`; for `mode: 'existing'` it enumerates the scope's entry directory and returns the nearest existing entry date in the requested direction (or `null` if none).

2. **Two command classes** in `src/provider/commands/open-previous-entry.ts` and `open-next-entry.ts`. Both extend `AbstractLoadEntryForDateCommand` to reuse the existing local-vs-remote dialog, error handling, and `loadPageForInput` plumbing. Each `execute()` resolves the anchor, computes the target date via `findAdjacentEntry`, builds an `Input` with the resolved offset, and either delegates to the base class (when the target file exists or mode is `calendar`) or shows an info toast (when `existing` mode returns `null`).

3. **Manifest + l10n wiring**. New commands, keybindings, settings, and locale strings in `package.json`, `package.nls*.json`, and `l10n/bundle.l10n*.json`.

Trade-offs:
- Splitting "anchor resolution + adjacency scan" into a pure helper makes the directory walk unit-testable without going through `vscode.commands.executeCommand`. The cost is one extra small file, which is consistent with the existing `features/` style (`load-note.ts`, `match-input.ts`, `scan-entries.ts`).
- Extending `AbstractLoadEntryForDateCommand` carries the remote-session prompt for free. Alternative — duplicating the open-vs-create path — is rejected because it would diverge over time.
- Adjacency scan does NOT reuse `ScanEntries`. `ScanEntries` enumerates everything for the picklist and caches; navigation needs the OPPOSITE access pattern (a quick "is there an entry on day X" check, ideally short-circuiting after one hit). A fresh, tightly-scoped `vscode.workspace.fs.readDirectory` walk is simpler and avoids the cache-invalidation hazard called out in spec open-question #3.

Detection technique: TDD. The pure helper has straightforward, mockable inputs — write the test cases for both modes and both directions first, then implement.

## Steps

### Step 1 — Baseline

- Branch already checked out and synced with `develop` (carries the merged #51 work).
- Run `npm install` and `npm run check`. Confirm 57 tests pass before any change.

### Step 2 — Manifest scaffolding (no impl yet)

The manifest entries are independent of the implementation and easier to review in isolation. Add them first so the test file can reference `vscode.workspace.getConfiguration('journal').get('navigation.mode')` without a manifest mismatch.

- `package.json` `contributes.commands` — append:
  ```json
  { "command": "journal.openPrevious", "title": "%command.journal.openPrevious.title%", "category": "Journal" },
  { "command": "journal.openNext", "title": "%command.journal.openNext.title%", "category": "Journal" }
  ```
- `package.json` `contributes.keybindings` — append:
  ```json
  { "command": "journal.openPrevious", "key": "ctrl+j ,", "mac": "cmd+j ,", "when": "editorTextFocus" },
  { "command": "journal.openNext", "key": "ctrl+j .", "mac": "cmd+j .", "when": "editorTextFocus" }
  ```
- `package.json` `contributes.configuration.properties` — append:
  ```json
  "journal.navigation.mode": {
    "type": "string",
    "enum": ["existing", "calendar"],
    "default": "existing",
    "description": "%configuration.journal.navigation.mode.description%"
  }
  ```
- `package.nls.json` — add `command.journal.openPrevious.title`, `command.journal.openNext.title`, `configuration.journal.navigation.mode.description`.
- `package.nls.<locale>.json` for de, fr, es, it, pt, nl, ru, zh, ja, ar — same three keys, translated. Translations: machine-translate as a first pass, mark in the PR description for native-speaker review (consistent with how the existing locale files were populated per the l10n migration).
- `l10n/bundle.l10n.json` — add runtime strings:
  - `"No earlier journal entry found."`
  - `"No later journal entry found."`
- `l10n/bundle.l10n.<locale>.json` — same two strings, translated, for each of the ten non-default locales.
- `npm run l10n:export` to confirm the export script accepts the new keys without errors.

After this step, `npm run check` should still pass (no Code changes yet, just manifest growth).

### Step 3 — Failing tests (TDD)

New file `src/test/suite/commands-prev-next.test.ts`. Pattern matches `commands-entry.test.ts` — uses real `vscode.workspace.fs` and an isolated tmp `journal.base`.

Tests in this file (all failing initially):

1. **`navigation.resolveAnchor` returns the parsed date and default scope for a daily-entry path.** Seed an entry at `<tmpBase>/2025/03/08.md`, open it, call `resolveAnchor`, assert `{ date: 2025-03-08, scope: 'default' }`.
2. **`navigation.resolveAnchor` falls back to today + default scope when no editor is open.** Close all editors, call `resolveAnchor`, assert `date` is today and `scope === 'default'`.
3. **`navigation.resolveAnchor` falls back to today + default scope for a non-journal file.** Open a random `.md` outside the journal base, call `resolveAnchor`, assert the today fallback.
4. **`findAdjacentEntry(existing, previous)` finds the nearest past entry.** Seed `03-05`, `03-08`, `03-12`. Anchor `03-08`. Call with `direction: 'previous'`. Assert `2025-03-05`.
5. **`findAdjacentEntry(existing, next)` finds the nearest future entry.** Same seed, anchor `03-08`, direction `next`. Assert `2025-03-12`.
6. **`findAdjacentEntry(existing, previous)` returns `null` at the start of history.** Anchor `03-05` (the oldest seeded entry). Direction `previous`. Assert `null`.
7. **`findAdjacentEntry(existing, next)` returns `null` at the end of history.** Anchor `03-12`. Direction `next`. Assert `null`.
8. **`findAdjacentEntry(calendar, previous)` always returns `anchor - 1d`.** Anchor `03-08`, mode `calendar`, direction `previous`. Assert `2025-03-07` regardless of whether `03-07.md` exists.
9. **`findAdjacentEntry(calendar, next)` always returns `anchor + 1d`.** Mirror of #8.
10. **`findAdjacentEntry` walks year boundaries.** Seed `2024/12/30.md` and `2025/01/05.md`. Anchor `2024/12/30`, mode `existing`, direction `next`. Assert `2025-01-05`.
11. **`OpenPreviousEntryCommand.execute` opens the prior entry.** Seed `03-05/08/12`. Open `03-08`. Execute the command. Assert `vscode.window.activeTextEditor.document.uri.fsPath` ends with `03-05` (loose comparator to tolerate path separators).
12. **`OpenPreviousEntryCommand.execute` shows a toast and does not change editor at the start of history.** Open `03-05`. Spy on `vscode.window.showInformationMessage`. Execute. Assert the spy was called with the l10n string and the active editor is unchanged.
13. **`OpenNextEntryCommand.execute` in `calendar` mode creates the next-day entry if missing.** Set `journal.navigation.mode` to `calendar`. Anchor `03-08`. Execute next. Assert `03-09.md` exists on disk and is the active editor.

Run `npm test -- --grep "#144"`. Confirm 13 reds.

### Step 4 — Implement `navigation.ts`

New file `src/actions/navigation.ts` (~80 lines).

```typescript
import * as vscode from 'vscode';
import * as Path from 'path';
import { Ctrl } from '../util/controller';
import { getDateFromURIAndConfig } from '../util/paths';
import { SCOPE_DEFAULT } from '../ext/conf';
import { fileExists } from '../util/fs-exists';

export type Direction = 'previous' | 'next';
export type Mode = 'existing' | 'calendar';

export interface Anchor {
    date: Date;
    scope: string;
}

export async function resolveAnchor(ctrl: Ctrl, editor: vscode.TextEditor | undefined): Promise<Anchor> {
    if (!editor) { return { date: stripTime(new Date()), scope: SCOPE_DEFAULT }; }
    try {
        const date = await getDateFromURIAndConfig(editor.document.uri.fsPath, ctrl.config);
        const scope = await resolveScopeFromPath(ctrl, editor.document.uri.fsPath);
        return { date: stripTime(date), scope };
    } catch {
        return { date: stripTime(new Date()), scope: SCOPE_DEFAULT };
    }
}

export async function findAdjacentEntry(
    ctrl: Ctrl,
    anchor: Anchor,
    direction: Direction,
    mode: Mode,
): Promise<Date | null> {
    if (mode === 'calendar') {
        return addDays(anchor.date, direction === 'previous' ? -1 : 1);
    }
    return walkForAdjacent(ctrl, anchor, direction);
}

// Implementation helpers (stripTime, addDays, resolveScopeFromPath, walkForAdjacent)
// — kept private to this module.
```

`walkForAdjacent` is the load-bearing function. Strategy:

1. Resolve the anchor's scope base path (`ctrl.config.getBasePath(anchor.scope)`).
2. Resolve the entry-path template for the anchor date (`ctrl.config.getResolvedEntryPath(anchor.date, anchor.scope)`) and entry-file template (`ctrl.config.getEntryFilePattern(anchor.date)`).
3. From the path template, compute the directory shape (`${base}/${year}/${month}`). This gives the per-month container.
4. Enumerate year directories under `${base}` via `vscode.workspace.fs.readDirectory` (filter to entries matching `\d{4}`). Sort ascending or descending based on direction.
5. Within each year, enumerate month directories (filter to `\d{2}` or matching the configured pattern); sort.
6. Within each month, enumerate day files (filter to `\d{2}\.<ext>` or matching the configured file pattern); sort.
7. As the walk iterates, compare each candidate's parsed date to the anchor:
   - For `direction: 'previous'`: keep iterating until the LAST candidate strictly less than the anchor date is found.
   - For `direction: 'next'`: keep iterating until the FIRST candidate strictly greater than the anchor date is found.
8. Short-circuit: when iterating in the chosen direction (descending for `previous`, ascending for `next`) the first candidate matching the strict-inequality condition IS the answer; no need to continue.

`resolveScopeFromPath` checks each configured scope's base path (`ctrl.config.getBasePath(scopeId)`) and returns the scope whose base is a prefix of the file path. Falls back to `SCOPE_DEFAULT`.

Re-run tests 1–10. Confirm they pass.

### Step 5 — Implement command classes

New file `src/provider/commands/open-previous-entry.ts`:

```typescript
'use strict';
import * as vscode from 'vscode';
import * as J from '../..';
import { AbstractLoadEntryForDateCommand } from './show-entry-for-date';
import { findAdjacentEntry, resolveAnchor, Mode } from '../../actions/navigation';

export class OpenPreviousEntryCommand extends AbstractLoadEntryForDateCommand {
    title: string = vscode.l10n.t("Open the previous journal entry");
    command: string = "journal.openPrevious";

    public static create(ctrl: J.Util.Ctrl): vscode.Disposable {
        const cmd = new this(ctrl);
        vscode.commands.registerCommand(cmd.command, () => cmd.run());
        return cmd;
    }

    public async run(): Promise<void> {
        const mode = (vscode.workspace.getConfiguration('journal').get<string>('navigation.mode') ?? 'existing') as Mode;
        const anchor = await resolveAnchor(this.ctrl, vscode.window.activeTextEditor);
        const target = await findAdjacentEntry(this.ctrl, anchor, 'previous', mode);
        if (target === null) {
            await vscode.window.showInformationMessage(vscode.l10n.t("No earlier journal entry found."));
            return;
        }
        const input = new J.Model.Input();
        input.offset = daysBetween(new Date(), target); // negative for past
        await this.execute(input);
    }
}
```

`OpenNextEntryCommand` mirrors with `direction: 'next'` and the "No later journal entry found." string.

`daysBetween(today, target)` is a tiny helper colocated in `navigation.ts` and exported. It computes the integer day delta so the existing `Input.offset` machinery in `AbstractLoadEntryForDateCommand` resolves the same date.

Wire into `src/provider/commands/index.ts` and `src/ext/startup.ts` alongside the other `.create(ctrl)` calls.

Re-run tests 11–13. Confirm they pass.

### Step 6 — Full check

- `npm run check` — lint clean, all tests pass.
- `npm run l10n:export` — bundle regenerates without warnings.

### Step 7 — Manual verification (Extension Development Host)

Drive the scenarios from spec acceptance #2–#5 in the EDH (`F5`). Capture before/after for the PR description.

- Pre-seed `test/ws_manual/` (or a fresh tmp workspace) with three daily entries.
- Open the middle one. Try `Ctrl+J ,` and `Ctrl+J .`. Try the edges (no earlier / no later).
- Toggle `journal.navigation.mode` to `calendar`. Repeat. Verify create-if-missing.
- Close all editors. Try the keybindings — confirm today fallback works.
- Configure a second scope. Add entries to it. Open one. Confirm navigation stays within the scope.
- Spot-check the German locale (`code --locale=de`): command palette titles and the info toasts render in German.

### Step 8 — Documentation hook

Per issue #181 (the docs refresh issue filed this session), update the two short anchors that block the smoke test from running:

- Append `journal.openPrevious` and `journal.openNext` (with `Ctrl+J ,` / `Ctrl+J .` bindings) to `docs/commands.md`.
- Append `journal.navigation.mode` to `docs/settings.md` with one short paragraph and an enum table.

Detailed cross-doc reconciliation is owned by #181 and is NOT in scope for this PR.

### Step 9 — PR + release artifacts

- `CHANGELOG.md` — under `Unreleased`, add an `### Added` block (or extend an existing one) referencing #144.
- `PLAN.md` — no phase change; the feature is independent of the modernization roadmap. Optionally append a one-line note under "Planned" -> "Done" if you maintain that history.
- PR title: `feat(navigation): open previous / next entry commands (#144)`.
- PR body links: issue, spec doc, plan doc, EDH screenshots.
- Post on the issue: "PR #Y opens — implementing approved plan." Nothing else.

## Test scenarios

| ID | Layer | Name | Acceptance link |
|----|-------|------|-----------------|
| T1 | unit (helper) | `resolveAnchor` parses a daily-entry path to `{ date, scope }` | spec § In scope #3 |
| T2 | unit | `resolveAnchor` falls back to today when no editor is open | spec § In scope #3 |
| T3 | unit | `resolveAnchor` falls back to today for a non-journal file | spec § In scope #3 |
| T4 | unit | `findAdjacentEntry(existing, previous)` finds the prior on-disk entry | spec § Acceptance #2 |
| T5 | unit | `findAdjacentEntry(existing, next)` finds the next on-disk entry | spec § Acceptance #2 |
| T6 | unit | `findAdjacentEntry(existing, previous)` returns `null` at the start | spec § Acceptance #2 (edge toast) |
| T7 | unit | `findAdjacentEntry(existing, next)` returns `null` at the end | spec § Acceptance #2 (edge toast) |
| T8 | unit | `findAdjacentEntry(calendar, previous)` returns `anchor − 1d` | spec § Acceptance #3 |
| T9 | unit | `findAdjacentEntry(calendar, next)` returns `anchor + 1d` | spec § Acceptance #3 |
| T10 | unit | `findAdjacentEntry` crosses year boundaries | spec § Open questions #1 |
| T11 | integration | `OpenPreviousEntryCommand` opens the prior entry | spec § Acceptance #2 |
| T12 | integration | `OpenPreviousEntryCommand` shows the "no earlier" toast and leaves the editor unchanged | spec § Acceptance #2 |
| T13 | integration | `OpenNextEntryCommand` in `calendar` mode creates the next-day entry | spec § Acceptance #3 |
| M1 | manual (EDH) | All five acceptance scenarios from spec § Acceptance manually verified | spec § Acceptance #2–#6 |
| M2 | manual (EDH) | German-locale spot-check of command titles and toasts | spec § Acceptance #6 |

## Dependencies

None. No cross-issue blockers, no cross-repo branches required.

Soft dependency: issue #181 (docs refresh) — this PR adds the two thin doc anchors needed for the smoke test (#180) section on configuration. The full docs reconciliation is #181's responsibility.

## Risk

- **R1: `getDateFromURIAndConfig` brittleness.** It already uses moment.js (slated for removal in PLAN.md Phase 3) and parses by template substitution. If the user's `journal.patterns` deviates from the default shape, anchor detection may fail and silently fall back to today. *Mitigation:* T3 covers a non-journal file. Document the fallback in `docs/commands.md` so the behavior is explicit. Phase 3 will improve this surface; we ride along with whatever it does later.
- **R2: Directory walk performance.** For a journal that has been used daily for 5+ years, the directory tree has ~60+ month folders, each with ~30 day files. Worst case `previous` from `2025-01-01` walks back through 2024, 2023, … until it finds one — but the directory listing is small (12 months × 31 day files at most). No measurable UI block expected. *Mitigation:* Short-circuit on first match. If anyone reports slowness, add a single-level cache keyed by scope.
- **R3: Scope detection by prefix-match.** If two scopes have base paths where one is a prefix of the other (e.g. `~/Journal` and `~/Journal/work`), `resolveScopeFromPath` may pick the wrong one. *Mitigation:* iterate longest-base-first when matching; covered by an additional unit test if reviewers flag it. Configured scopes with overlapping bases are pathological but we should not silently misroute.
- **R4: l10n machine-translation quality.** Strings for ten non-English locales translated by machine. Native-speaker review is asynchronous. *Mitigation:* PR description flags the non-English strings for native-speaker review; the feature works in English even if a locale string is imperfect. Same approach used during the `vscode.l10n` migration.
- **R5: Keybinding collisions.** `Ctrl+J ,` and `Ctrl+J .` are chord-style — unlikely to collide with built-in VS Code commands, but third-party extensions may bind them. *Mitigation:* keybinding `when: editorTextFocus` narrows the trigger surface. Users can rebind via Keyboard Shortcuts as the issue explicitly anticipates.

## Rollback

- Revert the squashed PR commit on `develop`. No data migration, no config schema migration concerns. Pre-existing settings without `journal.navigation.mode` continue to work; the absence of the setting on a rolled-back manifest just makes the key inert.
- Manifest entries (commands, keybindings, configuration) are additive and revert cleanly.

## Reference spec

`docs/specs/2026-05-14-feat-144-prev-next-navigation.md` (committed at `3a35d24`).
