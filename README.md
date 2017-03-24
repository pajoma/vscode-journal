# vscode-journal README

Lightweight Extension for Visual Studio Code to take track of your daily notes.  

## What's this about?
This extension is only useful for people like me, who use simple text files for notes, task lists, and everything else which has to be remembered and searched for. Textfiles are easy to backup, sync and can be opened anywhere by everything. This extension has the following functions: 

* Open or create a journal page for a specific day (with shortcuts for today and tomorrow )
* Add detailed notes for today 
* Add a memo to today's journal page (one liner e.g. for tasks)


## Features
Press 'F1' or Ctrl+Shift+P to access one of the  commands. 
The notes are stored in a folder on your pc using the following structure (taking ZIM Desktop wiki as inspiration: `year/month/day.md`, the notes files for October 22th would be `../2016/10/22.md`. Detailed notes (e.g. meeting notes) are placed in the subfolder `../2016/10/22/some-meeting-notes.md`.

## Commands 

### Journal Pages
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
* `11-24 task do something` adds a task for page of Nov 24th
* `+1 I have to remember this` adds a memo to tomorrow's page
* `0` opens today's page

`journal:today` is a shortcut for `journal:day` with the offset `0`

`journal:tomorrow` is also a shortcut to open tomorrow's journal page. 

### Notes & Memos
`journal:note` opens a dialog to enter the title of a new page for notes. The title is also the filename (stored as subfolder in the journal structure, e.g. folder ´25´ in folder ´10´ if today is 10/25).  Local links are automatically added to the current day's journal page.  

`journal:memo` (deprecated) opens the same dialog as `journal:day` 

### Open the journal
`journal:open` starts a new instance of vscode with the base directory of your journal as root 


## Settings
You have to set the base folder for notes folder structure before you start. Open your settings, search for 'journal' and copy the journal.base line into your personal settings. Adjust the value, for example: ` "journal.base": "C:/Users/FooBar/Documents/Journal"` (use forward slash!)

The default file format is Markdown (using `md` as extension), which is natively supported by Visual Studio Code. I use Asciidoc for my notes (with `.adoc` as extension), in this case you should also install an Asciidoc Syntax extension. 

