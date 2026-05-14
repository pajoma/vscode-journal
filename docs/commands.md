# Visual Studio Code Commands of vscode-journal
Press 'F1' or Ctrl+Shift+P to access one of the  commands. 

You can access all functionality (besides opening the journal) from the smart input. 

## Journal Pages

* `journal:day` (keybindings: `ctrl+shift+j` or `cmd+shift+j` on mac) opens the smart input, see
* `journal:today` for opening today's entry
* `journal:tomorrow`
* `journal:openPrevious` (keybindings: `ctrl+j ,` or `cmd+j ,` on mac) opens the previous journal entry relative to the file currently in focus. When no journal file is open, navigation starts from today. Behavior controlled by `journal.navigation.mode` (see `settings.md`):
  * `existing` *(default)* — skip gaps and open the previous entry that exists on disk. Shows an info toast at the start of history.
  * `calendar` — step exactly one day back and create the entry if missing.
* `journal:openNext` (keybindings: `ctrl+j .` or `cmd+j .` on mac) mirror of `openPrevious` for forward navigation.

## Notes & Memos
`journal:note` opens a dialog to enter the title of a new page for notes.

## Open the journal
`journal:open` starts a new instance of vscode with the base directory of your journal as root 