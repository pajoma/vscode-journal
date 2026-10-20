# Navigating to journal entries

A journal entry is created for every day. It collects the day's tasks, memos and any other content which you don't want to have in separate notes. I use it personally mostly for time tracking.  

A wide range of different inputs is supported, see [this page](./smartInput.md) for more details. 

## Day, week and month

The first line of a page links up and sideways (CodeLens):

* In a **daily entry**: `← Fr, Oct 16, 2026` · `↑ Week 43` · `Th, Oct 22, 2026 →`: the previous day, the weekly entry of its week, the next day.
* In a **weekly entry**: `← Week 42` · `October 2026` · `Week 45 →`: the previous week, the calendar at its month (two months if the week spans them), the next week. Its days are links in the entry itself: the `## Daily Entries` section lists the working days as [wiki links](./notes.md#wiki-links), see [Weekly entries](./weekly-entries.md#daily-entries-auto-sync).
* In a **note**: the pages that link to it (backlinks), by markdown or wiki link, see [Notes](./notes.md#backlinks).

Previous and next follow `journal.navigation.mode`, like `Ctrl+J ,` and `Ctrl+J .`: with `existing` (the default) the nearest day or week that has an entry, with `calendar` the day or week right before and after, created on click.

The **Journal Calendar** (**Journal: Open Calendar**) opens beside the editor and shows a month:

* The week number in front of each week opens the weekly entry; a day opens its daily entry. Both are created if missing. The week number shows the tasks and notes of its weekly entry like a day.
* Each day shows its open and all tasks (`⚠ 2/3`, or `✓ 0/2` when all are done) and its notes, and is marked while tasks are open. Days without an entry are dimmed, today is framed.
* `‹` and `›` go to the month before and after, **Today** back to today's month.
* The calendar follows the editor: when you open an entry of another month, it shows that month.

**Journal: Open Week** opens the weekly entry of the entry you are in (or of today). `Ctrl+J ,` and `Ctrl+J .` step to the previous and next entry, see [Commands](./commands.md).

![Screen Capture](./navigation.gif)



