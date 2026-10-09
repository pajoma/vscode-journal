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
  "journal.patterns": { "entries": { "path": "\${base}/\${year}/\${month}", "file": "\${year}-\${month}-\${day}.\${ext}" } },
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
  return { client, call, file };
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
    assert.deepEqual(briefing.memos, ["Standup at 10"]);
    assert.deepEqual(
      briefing.open_tasks.map((t: { text: string }) => t.text),
      ["Today's task"],
    );
    assert.deepEqual(
      briefing.carried_over.map((t: { date: string; text: string }) => [t.date, t.text]),
      [["2026-10-07", "Old open task"]],
    );
    assert.equal(briefing.time.total_hours, 1.5);
  });

  it("offers only adding tools to the write-only scope", async () => {
    const { client } = await connect("write");
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ["add_memo", "add_note", "add_task", "add_time_entry"]);
  });
});
