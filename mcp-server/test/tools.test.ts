import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { connect } from "./connect.js";

describe("tools", () => {
  it("adds memos below the title and tasks with the user's templates", async () => {
    const { call, file } = await connect();
    await call("add_memo", { date: "2026-10-09", text: "Call the bank" });
    await call("add_memo", { date: "2026-10-09", text: "Bring the badge" });
    await call("add_task", { date: "2026-10-09", text: "Prepare package" });
    assert.match(
      file("2026-10-09"),
      /^# Friday, October 09 2026\n\n- MEMO .+: Call the bank\n- MEMO .+: Bring the badge\n\n## Tasks\n- \[ \] Prepare package\n\n## Notes\n/,
    );
    const day = await call("get_daily_journal", { date: "2026-10-09" });
    assert.deepEqual(
      day.memos.map((m: { text: string }) => m.text),
      ["Call the bank", "Bring the badge"],
    );
  });

  it("migrates open tasks to the next day and moves single tasks", async () => {
    const { call, file } = await connect();
    await call("add_task", { date: "2026-10-09", text: "Open one" });
    await call("add_task", { date: "2026-10-09", text: "Open two" });
    const [first] = await call("list_tasks", { from: "2026-10-09" });
    await call("update_task", { date: "2026-10-09", ref: first.ref, done: true });

    const result = await call("migrate_open_tasks", { date: "2026-10-09" });
    assert.equal(result.to, "2026-10-10");
    assert.deepEqual(
      result.moved.map((m: { text: string }) => m.text),
      ["Open two"],
    );
    assert.match(file("2026-10-09"), /- \[x\] Open one \(done: .+\)\n- \[>\] Open two \(moved: 2026-10-10\)/);
    assert.match(file("2026-10-10"), /## Tasks\n- \[ \] Open two\n/);

    const [task] = await call("list_tasks", { from: "2026-10-10" });
    await call("move_task", { date: "2026-10-10", ref: task.ref, to: "2026-10-12" });
    assert.match(file("2026-10-12"), /- \[ \] Open two\n/);
    assert.deepEqual(await call("list_tasks", { from: "2026-10-10" }), []);
  });

  it("builds a daily briefing with carried-over tasks", async () => {
    const { call } = await connect();
    await call("add_task", { date: "2026-10-07", text: "Old open task" });
    await call("add_memo", { date: "2026-10-09", text: "Standup at 10" });
    await call("add_task", { date: "2026-10-09", text: "Today's task" });
    await call("add_time_entry", { date: "2026-10-09", start: "08:00", end: "09:30", project: "P", description: "D" });

    const briefing = await call("get_daily_briefing", { date: "2026-10-09" });
    assert.deepEqual(briefing.day.memos, ["Standup at 10"]);
    assert.deepEqual(
      briefing.day.open_tasks.map((t: { text: string }) => t.text),
      ["Today's task"],
    );
    assert.deepEqual(
      briefing.carried_over.daily.map((t: { entry: string; text: string }) => [t.entry, t.text]),
      [["2026-10-07", "Old open task"]],
    );
    assert.equal(briefing.day.time.total_hours, 1.5);
  });

  it("numbers the tasks of each result 1, 2, 3 …, so the user can refer to them", async () => {
    const { call } = await connect();
    await call("add_task", { date: "2026-10-07", text: "Old open task" });
    await call("add_task", { date: "2026-10-09", text: "First" });
    await call("add_task", { date: "2026-10-09", text: "Second" });
    await call("add_task", { date: "2026-10-09", period: "weekly", text: "Weekly" });
    const numbered = (tasks: { no: number; text: string }[]) => tasks.map((t) => [t.no, t.text]);

    const listed = await call("list_tasks", { from: "2026-10-07", to: "2026-10-09" });
    assert.deepEqual(numbered(listed), [[1, "Old open task"], [2, "Weekly"], [3, "First"], [4, "Second"]],
      "one numbering across all entries of the result, in the order they are listed");
    assert.deepEqual(numbered((await call("get_daily_journal", { date: "2026-10-09" })).tasks), [[1, "First"], [2, "Second"]]);

    // the briefing numbers its open tasks in result order: day, week, carried over
    const briefing = await call("get_daily_briefing", { date: "2026-10-09" });
    assert.deepEqual(
      [briefing.day.open_tasks, briefing.week.open_tasks, briefing.carried_over.daily].map(numbered),
      [[[1, "First"], [2, "Second"]], [[3, "Weekly"]], [[4, "Old open task"]]],
    );

    // "complete 4": the number leads to the task's ref
    const second = listed.find((t: { no: number }) => t.no === 4);
    await call("update_task", { date: "2026-10-09", ref: second.ref, done: true });
    assert.deepEqual(numbered(await call("list_tasks", { from: "2026-10-09", period: "daily" })), [[1, "First"]]);
  });

  it("returns only what the user acts on with detail 'brief' (#301)", async () => {
    const { call } = await connect();
    await call("add_task", { date: "2026-10-07", text: "Old" });
    await call("add_task", { date: "2026-10-09", period: "weekly", text: "Weekly" });
    await call("add_memo", { date: "2026-10-09", text: "Standup at 10" });
    await call("add_task", { date: "2026-10-09", text: "Open" });
    const { ref } = await call("add_task", { date: "2026-10-09", text: "Finished" });
    await call("update_task", { date: "2026-10-09", ref, done: true });
    await call("add_time_entry", { date: "2026-10-09", start: "08:00", end: "09:30", project: "P", description: "D" });
    await call("add_note", { date: "2026-10-09", heading: "Kickoff", content: "Long minutes" });
    // refs are checked once below; without them the shapes can be compared exactly
    const withoutRefs = (tasks: { ref: string }[]) => tasks.map((t) => ({ ...t, ref: undefined }));
    const task = (no: number, period: string, entry: string, text: string) => ({ no, period, entry, text, ref: undefined });
    const brief = (e: { open_tasks: { ref: string }[] }) => ({ ...e, open_tasks: withoutRefs(e.open_tasks) });

    const day = await call("get_daily_journal", { date: "2026-10-09", detail: "brief" });
    const expectedDay = {
      period: "daily",
      entry: "2026-10-09",
      exists: true,
      memos: ["Standup at 10"],
      open_tasks: [task(1, "daily", "2026-10-09", "Open")],
      done_count: 1,
      total_hours: 1.5,
      note_topics: ["Kickoff"],
    };
    assert.deepEqual(brief(day), expectedDay, "a daily entry in brief");
    assert.ok(day.open_tasks[0].ref, "the ref stays, so 'complete 1' works");

    const week = await call("get_weekly_journal", { date: "2026-10-09", detail: "brief" });
    const expectedWeek = {
      period: "weekly",
      entry: "2026-W41",
      exists: true,
      memos: [],
      open_tasks: [task(1, "weekly", "2026-W41", "Weekly")],
      done_count: 0,
      note_topics: [],
    };
    assert.deepEqual(brief(week), expectedWeek, "a weekly entry in brief has no hours");

    // the briefing shows day and week like the entry tools, numbered across the result
    const briefing = await call("get_daily_briefing", { date: "2026-10-09", detail: "brief" });
    assert.deepEqual(brief(briefing.day), expectedDay, "the day as get_daily_journal shows it");
    assert.deepEqual(brief(briefing.week), { ...expectedWeek, open_tasks: [task(2, "weekly", "2026-W41", "Weekly")] },
      "the week as get_weekly_journal shows it, numbered after the day");
    assert.deepEqual(withoutRefs(briefing.carried_over.daily), [task(3, "daily", "2026-10-07", "Old")],
      "carried-over tasks without heading and status");
    assert.deepEqual(briefing.carried_over.weekly, []);

    assert.deepEqual(withoutRefs(await call("list_tasks", { from: "2026-10-09", period: "daily", detail: "brief" })),
      [task(1, "daily", "2026-10-09", "Open")], "list_tasks in brief: no heading, no status");
    assert.deepEqual(
      (await call("list_tasks", { from: "2026-10-09", period: "daily", status: "all", detail: "brief" })).map((t: { status: string }) => t.status),
      ["open", "done"],
      "the status stays when the list mixes them",
    );
    assert.deepEqual(await call("list_time_entries", { from: "2026-10-09", detail: "brief" }), {
      total_hours: 1.5,
      hours_by_project: { P: 1.5 },
    }, "time in brief: only the hours");

    // without detail everything, as before
    const full = await call("get_daily_journal", { date: "2026-10-09" });
    assert.match(full.notes.markdown, /Long minutes/, "full results keep the note text");
    assert.deepEqual(full.tasks.map((t: { status: string }) => t.status), ["open", "done"], "full results keep done tasks");
  });

  it("supports weekly entries: tasks, moving between day and week, migration, briefing", async () => {
    const { call, weekFile } = await connect();
    await call("add_task", { date: "2026-10-01", period: "weekly", text: "Last week's goal" });
    await call("add_task", { date: "2026-10-09", period: "weekly", text: "Weekly goal" });
    assert.match(weekFile("2026", 41), /^# Week 41\n\n## Tasks\n- \[ \] Weekly goal\n\n## Notes\n\n## Daily Entries\n/);

    // a daily task becomes a weekly one
    const { ref } = await call("add_task", { date: "2026-10-09", text: "Plan offsite" });
    const moved = await call("move_task", { date: "2026-10-09", ref, to: "2026-10-09", to_period: "weekly" });
    assert.equal(moved.to, "2026-W41");

    // notes go before the extension's "## Daily Entries" block
    await call("add_note", { date: "2026-10-09", period: "weekly", content: "Retro idea" });
    assert.match(weekFile("2026", 41), /## Notes\n\nRetro idea\n\n## Daily Entries/);

    const tasks = await call("list_tasks", { from: "2026-10-09" });
    assert.deepEqual(
      tasks.map((t: { period: string; text: string }) => [t.period, t.text]),
      [
        ["weekly", "Weekly goal"],
        ["weekly", "Plan offsite"],
      ],
    );

    const briefing = await call("get_daily_briefing", { date: "2026-10-09" });
    assert.equal(briefing.week.entry, "2026-W41");
    assert.deepEqual(
      briefing.week.open_tasks.map((t: { text: string }) => t.text),
      ["Weekly goal", "Plan offsite"],
    );
    assert.deepEqual(
      briefing.carried_over.weekly.map((t: { text: string }) => t.text),
      ["Last week's goal"],
    );

    const migrated = await call("migrate_open_tasks", { date: "2026-10-09", period: "weekly" });
    assert.equal(migrated.to, "2026-W42");
    assert.match(weekFile("2026", 41), /- \[>\] Weekly goal \(moved: 2026-W42\)/);
    assert.match(weekFile("2026", 42), /- \[ \] Weekly goal\n- \[ \] Plan offsite\n/);
  });

  it("offers only adding tools to the write-only token", async () => {
    const { client } = await connect("write");
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), [
      "add_memo",
      "add_note",
      "add_task",
      "add_time_entry",
      "create_note",
      "create_scope",
    ]);
  });
});
