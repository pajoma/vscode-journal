import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { loadConfig } from "../src/config.js";
import { createMcpServer, type Scope } from "../src/server.js";
import { createStore } from "../src/store.js";

const SETTINGS = `{
  "journal.patterns": {
    "entries": { "path": "\${base}/\${year}/\${month}", "file": "\${year}-\${month}-\${day}.\${ext}" },
    "weeks": { "path": "\${base}/\${year}", "file": "\${year}-w\${week}.\${ext}" }
  },
  "journal.templates": [
    { "name": "entry", "template": "# \${d:dddd, MMMM DD YYYY}\\n\\n## Tasks\\n\\n## Notes\\n\\n" },
    { "name": "task", "template": "- [ ] \${input}", "after": "## Tasks" },
    { "name": "memo", "template": "- MEMO \${localTime}: \${input}" }
  ]
}`;

async function connect(scope: Scope = "full") {
  const dir = mkdtempSync(path.join(tmpdir(), "journal-mcp-tools-"));
  const repo = path.join(dir, "repo");
  mkdirSync(repo);
  writeFileSync(path.join(dir, "settings.json"), SETTINGS);
  const cfg = loadConfig({
    JOURNAL_REPO_PATH: repo,
    JOURNAL_SETTINGS: path.join(dir, "settings.json"),
    NOTES_READABLE: "true",
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer(createStore(cfg), cfg, scope).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    if (result.isError) throw new Error(result.content[0].text);
    return JSON.parse(result.content[0].text);
  };
  const file = (date: string) =>
    readFileSync(path.join(repo, date.slice(0, 4), date.slice(5, 7), `${date}.md`), "utf8");
  const weekFile = (year: string, week: number) => readFileSync(path.join(repo, year, `${year}-w${week}.md`), "utf8");
  return { client, call, file, weekFile };
}

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

  it("offers only adding tools to the write-only scope", async () => {
    const { client } = await connect("write");
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ["add_memo", "add_note", "add_task", "add_time_entry"]);
  });
});
