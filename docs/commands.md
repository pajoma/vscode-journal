# VS Code Journal — Commands and Keybindings

Press `F1` or `Ctrl+Shift+P` and type `journal` to browse all commands. Most functionality is also reachable from the smart input (`Ctrl+Shift+J`).

## Keybindings

| Command ID | Win / Linux | Mac | `when` clause | Description |
|---|---|---|---|---|
| `journal.day` | `Ctrl+Shift+J` | `Cmd+Shift+J` | — | Open the smart input (journal entry, note, memo, task) |
| `journal.printDuration` | `Ctrl+J D` | `Cmd+J D` | `editorTextFocus && editorHasMultipleSelections` | Print elapsed hours between two selected timestamps |
| `journal.printSum` | `Ctrl+J S` | `Cmd+J S` | `editorTextFocus && editorHasMultipleSelections` | Print sum of selected numbers |
| `journal.openPrevious` | `Ctrl+J ,` | `Cmd+J ,` | `editorTextFocus` | Open the previous journal entry relative to the current file |
| `journal.openNext` | `Ctrl+J .` | `Cmd+J .` | `editorTextFocus` | Open the next journal entry relative to the current file |

The `when` clause controls whether the binding is active. `editorHasMultipleSelections` means two or more non-empty selection ranges must exist (e.g. select two timestamps with `Alt+Click` before using `Ctrl+J D`). `editorTextFocus` means a text editor must be focused.

## Command reference

### Journal Pages

* `journal.day` — Opens the smart input. See [Smart Input](./smartInput.md) for the full syntax.
* `journal.today` — Jump directly to today's journal entry (no input dialog).
* `journal.tomorrow` — Jump directly to tomorrow's journal entry.
* `journal.openPrevious` — Open the previous journal entry relative to the file currently in focus. When no journal file is open, navigation starts from today. Behavior is controlled by `journal.navigation.mode` (see [Settings](./settings.md#navigation-mode)):
  * `existing` *(default)* — skip gaps and open the previous entry that exists on disk. Shows an info toast at the start of history.
  * `calendar` — step exactly one day back and create the entry if missing.
* `journal.openNext` — Mirror of `journal.openPrevious` for forward navigation.

### Notes & Memos

* `journal.note` — Open a dialog to enter the title of a new note page.

### Open the journal

* `journal.open` — Start a new VS Code window with the journal base directory as workspace root.

### Print commands

* `journal.printTime` — Insert the current time at the cursor position.
* `journal.printDuration` — Compute the elapsed hours between two selected timestamps (select both with `Alt+Click`, then press `Ctrl+J D`).
* `journal.printSum` — Sum all selected numbers (select with `Alt+Click`, then press `Ctrl+J S`).

See [Print commands](./print.md) for examples.

## How to rebind

Open `File → Preferences → Keyboard Shortcuts` (or `Cmd+K Cmd+S` on Mac), search for `journal`, and click the pencil icon next to any binding. To set bindings in `keybindings.json` directly:

```json
{
  "key": "ctrl+j n",
  "command": "journal.note",
  "when": "true"
}
```

Replace `journal.note` with any command ID from the table above. The `when` clause is optional — omit it to make the binding unconditional.

## Localization

Command titles and user-facing prompts are localized via `vscode.l10n`. The extension ships translations for: **en, de, fr, es, it, pt, nl, ru, zh, ja, ar**. For any other locale VS Code falls back to English.
