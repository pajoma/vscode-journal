# Visual Studio Code Commands of vscode-journal
Press 'F1' or Ctrl+Shift+P to access one of the  commands. 


## Journal Pages
`journal:day` (keybindings: `ctrl+shift+j` or `cmd+shift+j` on mac) opens a dialog to enter one of the following: 
* _offset:_ `0` is today, `-1` yesterday, `+1` tomorrow, `+4` in four days, ...
* _day of week_:  `next wednesday` for journal page of next wednesday, `last wednesday` for previous. Supported values are `monday, mon, tuesday, tue, wednesday, wed, thursday, thu, friday, fri, saturday, sat, sunday, sun` 
* _date_: `10-25` for Oct 25, `25` for 25th of current month, `2015-25-10` for Oct 25 in 2015. Implausible values will be catched (e.g. `32` for day), simple errors (e.g. `11-31`) will open the next possible day (in this case `12-01`)
* _shortcuts_ are: `today, tod, tomorrow, tom, yesterday, yes`;

You can use the following modifiers when entering a value 
* _flags:_ like `todo` or `task` will add a bulletpoint. Example: `task today do this`
* _day:_ see description of the command `journal:day`. Example: `next wednesday remember the milk`

Any remaining text will be added as memo (or task) to the specified day (or today as default).   

Other Examples: 

* `+1 I have to remember this` adds a memo to tomorrow's page
* `0` opens today's page

`journal:today` is a shortcut for `journal:day` with the offset `0`

`journal:tomorrow` is also a shortcut to open tomorrow's journal page. 

## Notes & Memos
`journal:note` opens a dialog to enter the title of a new page for notes. 

`journal:memo` (deprecated) opens the same dialog as `journal:day` 

## Open the journal
`journal:open` starts a new instance of vscode with the base directory of your journal as root 