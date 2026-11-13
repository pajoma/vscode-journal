# Super Productivity

Tasks in your journal can be linked to tasks in [Super Productivity](https://super-productivity.com). The journal stays the place where you write your tasks down and plan your projects, Super Productivity is where you work on them and track your time.

## Setup

The integration talks to the Local REST API of the Super Productivity desktop app (the web version has none). The app has to run while you use it.

1. Turn on the Local REST API in the settings of Super Productivity and copy the token shown there.
1. Set `journal.superProductivity.enabled` to `true` in your user settings.
1. Run **Journal: Set Super Productivity API Token** and paste the token. It is kept in the secret storage of Visual Studio Code, not in your settings.

The API is expected at `http://127.0.0.1:3876`; `journal.superProductivity.url` changes the address. These settings are user settings: a workspace cannot change where the token is sent.

## Linking tasks

A task is linked by its [key](./scopes.md#tasks-of-a-scope): `#acme:12` for a task of the scope `acme`, `:7` for a task without scope. A task without key gets one when you send it.

Place the cursor on an open task and select the code action **Send to Super Productivity**: the task gets its key and is created in Super Productivity, with the key at the start of its title (`#acme:12 write release notes`).

The links are kept in the file `.vscode/superproductivity.json` in your journal, not in the text of your tasks: commit it with your journal, so your other machines know the links. It lists one key per line:

```json
{
  ":7": "AbC123",
  "#acme:12": "XTE9v9X8NR5m"
}
```

## Projects

A task goes to the project of its [scope](./scopes.md): the project with the title of the scope, case ignored (`#acme` → *ACME*), or the one you name in `journal.superProductivity.projects`:

```json
"journal.superProductivity.projects": { "acme": "ACME Relaunch" }
```

The value is the title or the id of the project. A task without scope of its own takes the scope of its parent task, then of the file (a plan in the scope's folder); without any, it goes to the inbox. A linked task that is still in the inbox when its scope gets a project goes to that project at the next sync; a task that is in a project already stays there.

## Syncing the current page

**Journal: Sync Tasks with Super Productivity** works on the page in the active editor:

1. **Send:** its open tasks that are not linked yet get keys and are created in Super Productivity. Tasks of a daily entry are planned for its day; tasks of weekly entries and plans for no day. Of a [plan](./scopes.md#plans), only the items without sub-items are sent, with their place in the plan as description, e.g. `acme › Plan › Phase 1: Discovery › interviews`.
1. **Import:** into a daily entry come the tasks of Super Productivity planned for that day that are linked nowhere, open or completed, each with a key of the scope of its project. Into today's entry also come the open tasks planned for an earlier day. Sub-tasks stay in Super Productivity.
1. **State:**
   * completed in Super Productivity: completed in the journal, with the time of its completion; also a plan item in progress
   * completed in the journal, open in Super Productivity: the more recent change wins. If the task was changed in Super Productivity after the time in `(done: 2026-11-12 12:12)`, it is reopened in the journal; otherwise it is completed in Super Productivity. A task completed in the journal without this annotation is always completed in Super Productivity.
   * open on both sides: planned in Super Productivity for the latest day of the key in your journal (a task moved on to another day, or a plan item pulled into a day), never for an earlier day than it is planned for there.

## Syncing the whole journal

**Journal: Sync All Entries with Super Productivity** syncs the state, the day and the project of the linked tasks of all entries and plans, open or not. It sends and imports nothing. Changed files are saved, unless they had unsaved changes before.

## While you work

* The code actions that complete or reopen a linked task do the same in Super Productivity.
* Planning a linked task for another day (**Plan for tomorrow** and the like, also pulling a plan item into a day) plans it for that day in Super Productivity; its linked sub-tasks, too.

The sync runs when you call a command, not in the background.

## From the betas

The betas `1.2.2-sp.1` to `sp.3` linked tasks with a comment at the end of the line, `<!-- sp:AbC123 -->`. The first sync of a page (or of the whole journal) turns such a link into a key: the task gets a key, the link moves into `.vscode/superproductivity.json`, and the comment is removed.

---

→ [Scopes](./scopes.md) · [Settings](./settings.md)
