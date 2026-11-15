# Working with tasks

![Screen Capture](./tasks.gif)

Tasks are modelled as checkpoints in your journal entries, e.g. 

```markdown
# Sunday, 2018/06/03

- [ ] Task: Fill out my taxes
- [x] Task: Finish the exercise 
```

You can enter tasks either manually or by the journal smart input (using `Ctrl+Shift+J`). The following examples work for the smart input: 

* `task Fill out my taxes` adds a task to today's entry
* `task 06-24 Call my mom` adds a task for entry of June 24th
* `task +1 Call my mom` adds a task for entry for tomorrow
* `task tom Call my mom` adds a task for entry for tomorrow
* `task next friday Call my mom` adds a task for entry for next friday

## Tasks in the preview

The markdown preview (`Ctrl+Shift+V`) of journal files shows each task with a box for its state: open `[ ]`, done `[x]`, in progress `[/]` (half filled, see [Plans](./scopes.md#plans)) and moved `[>]` (dashed, with an arrow). Click a box to complete the task (open or in progress) or to open it again (done), as with the code actions in the editor: with the done time, and its plan and Super Productivity follow. A moved task cannot be clicked. The first click may ask you to allow the extension to open the link (the preview passes it to VS Code as a `vscode://` link); a file without unsaved changes is saved. Markdown files outside the journal keep their `[ ]` as text.

## Sub-tasks

Indent tasks below a task to make them its sub-tasks, e.g. the steps of a ticket (a ticket such as `XX-1155` or `pida#23` can link to its tracker, see [Issue links](./notes.md#issue-links)):

```markdown
- [ ] Ticket XX-1155 update items in db
  - [ ] update records
  - [x] verify new records (done: 2026-10-19 10:00)
  - [ ] create new requests
```

Every line below a task that is indented deeper belongs to it: sub-tasks, their own sub-tasks and any text you write under them.

* **Complete:** on a task with open sub-tasks, the code actions offer *Complete this task* and *Complete this task and its 2 open sub-tasks*. Sub-tasks that are already done keep their completion time.
* **Plan for another day:** the task and its open sub-tasks are marked `[>]` and inserted in the target entry, the sub-tasks indented below the task. Done sub-tasks stay where they were done.

The [MCP server](./mcp.md) handles sub-tasks the same way: it asks before completing open sub-tasks, and moving or migrating a task takes its open sub-tasks along.

---

→ [Commands](./commands.md) · [Settings](./settings.md)
