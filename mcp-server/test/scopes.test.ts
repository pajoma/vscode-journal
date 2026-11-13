import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { noteLink, renderNote, uniqueFile } from "../src/scopes.js";
import { dayMoment } from "../src/template.js";
import { connect } from "./connect.js";

const DAY = "2026-10-09";

describe("scopes", () => {
  it("does not link a new note again that the entry names with a wiki link (#92)", async () => {
    const { call, file, repo } = await connect();
    await call("create_scope", { name: "vera" });
    const entry = path.join(repo, "2026", "10", "2026-10-09.md");
    mkdirSync(path.dirname(entry), { recursive: true });
    writeFileSync(entry, "# Friday\n\n## Tasks\n\n## Notes\n\nsee [[#vera konzept schnittstelle]]\n");
    await call("create_note", { scope: "vera", title: "Konzept Schnittstelle", content: "x", date: DAY });
    assert.ok(!file(DAY).includes("Konzept_Schnittstelle.md"), file(DAY));

    await call("create_note", { scope: "vera", title: "Other", content: "x", date: DAY });
    assert.match(file(DAY), /- NOTE: \[Other\]\(\.\.\/\.\.\/scopes\/vera\/Other\.md\)/);
  });

  it("creates a scope and a note in it, linked from the daily entry", async () => {
    const { call, file, repo } = await connect();
    assert.deepEqual(await call("create_scope", { name: "#vera" }), {
      name: "vera",
      created: true,
      folder: "scopes/vera",
    });
    assert.ok(existsSync(path.join(repo, "scopes/vera/.gitkeep")));
    assert.equal((await call("create_scope", { name: "vera" })).created, false);

    const result = await call("create_note", {
      scope: "vera",
      title: "Konzept Schnittstelle",
      content: "## Ziel\n\nEntkopplung.",
      tags: ["konzept"],
      date: DAY,
    });
    assert.equal(result.note, "Konzept_Schnittstelle.md");
    assert.equal(result.linked_in, "2026/10/2026-10-09.md");
    assert.equal(
      readFileSync(path.join(repo, "scopes/vera/Konzept_Schnittstelle.md"), "utf8"),
      "# Konzept Schnittstelle\n\n#vera #konzept\n\n## Ziel\n\nEntkopplung.\n",
    );
    // files template of the extension, relative link from the entry
    assert.match(
      file(DAY),
      /## Notes\n- NOTE: \[Konzept Schnittstelle\]\(\.\.\/\.\.\/scopes\/vera\/Konzept_Schnittstelle\.md\)\n/,
    );

    // no overwrite, no duplicate link
    await assert.rejects(
      call("create_note", { scope: "vera", title: "Konzept Schnittstelle", content: "x", date: DAY }),
      /already exists/,
    );
    await call("append_to_note", { scope: "vera", note: result.note, heading: "Ziel", content: "Und Testbarkeit." });
    const note = await call("get_note", { scope: "vera", note: result.note });
    assert.match(note.markdown, /Entkopplung\.\n\nUnd Testbarkeit\.$/);

    assert.deepEqual(await call("list_scopes", {}), [{ name: "vera", source: "folder", folder: "scopes/vera" }]);
    assert.deepEqual((await call("list_notes", { scope: "vera" })).notes, [
      { note: "Konzept_Schnittstelle.md", title: "Konzept Schnittstelle" },
    ]);
  });

  it("finds existing scope folders, nested notes, and refuses unknown scopes and path escapes", async () => {
    const { call, repo } = await connect();
    mkdirSync(path.join(repo, "scopes/plan/sub"), { recursive: true });
    writeFileSync(path.join(repo, "scopes/plan/sub/Idee.md"), "# Idee\n\ntext\n");
    writeFileSync(path.join(repo, "scopes/plan/Geheim.md"), "# Geheim #private\n\nsecret\n");
    assert.deepEqual((await call("list_notes", { scope: "plan" })).notes, [{ note: "sub/Idee.md", title: "Idee" }]);
    await assert.rejects(call("get_note", { scope: "plan", note: "Geheim.md" }), /not found/);
    await assert.rejects(call("get_note", { scope: "plan", note: "../../2026/10/x.md" }), /not inside scope/);
    await assert.rejects(call("create_note", { scope: "nope", title: "x", content: "y" }), /Unknown scope 'nope'/);
    await assert.rejects(call("create_scope", { name: "../evil" }), /may only contain/);
  });

  it("creates scopes with a slug only; 'default' is taken (spec 2026-11-13)", async () => {
    const { call } = await connect();
    assert.equal((await call("create_scope", { name: "#acme" })).name, "acme");
    await assert.rejects(call("create_scope", { name: "Acme2" }), /lowercase/);
    await assert.rejects(call("create_scope", { name: "2nd" }), /lowercase/);
    await assert.rejects(call("create_scope", { name: "default" }), /'default' is taken/);
  });

  it("gives a task of a scope the next key of the scope, counted over the journal (spec 2026-11-13)", async () => {
    const { call, file, repo } = await connect();
    await call("create_scope", { name: "acme" });
    writeFileSync(path.join(repo, "scopes/acme/Plan.md"), "# Plan\n\n- [ ] #acme:7 interview\n- [ ] :3 other\n");

    assert.equal((await call("add_task", { date: DAY, text: "call #Acme today" })).key, "#acme:8");
    assert.equal((await call("add_task", { date: DAY, text: "write report", scope: "acme" })).key, "#acme:9");
    assert.equal((await call("add_task", { date: DAY, text: "#acme:2 keeps its key" })).key, "#acme:2");
    assert.equal((await call("add_task", { date: DAY, text: "call the bank" })).key, undefined);
    assert.match(file(DAY), /- \[ \] call #acme:8 today\n- \[ \] #acme:9 write report\n- \[ \] #acme:2 keeps its key\n- \[ \] call the bank\n/);
    await assert.rejects(call("add_task", { date: DAY, text: "x", scope: "nope" }), /Unknown scope 'nope'/);
  });

  it("a plan item follows its execution: in progress, done with the day, reopened (spec 2026-11-13)", async () => {
    const { call, repo } = await connect();
    await call("create_scope", { name: "acme" });
    const plan = path.join(repo, "scopes/acme/Plan.md");
    writeFileSync(plan, "# Plan\n\n## Phase 1\n- [ ] #acme:5 interviews\n  - [x] invite (done: 2026-11-10 09:00)\n  - [ ] guide\n");

    const { ref } = await call("add_task", { date: DAY, text: "#acme:5 interviews" });
    assert.match(readFileSync(plan, "utf8"), /- \[\/\] #acme:5 interviews\n/);

    await call("update_task", { date: DAY, ref, done: true });
    assert.match(readFileSync(plan, "utf8"), /- \[x\] #acme:5 interviews \(done: .+\) \[\[2026-10-09\]\]\n/);

    const day = await call("list_tasks", { from: DAY, status: "done" });
    await call("update_task", { date: DAY, ref: day[0].ref, done: false });
    assert.match(readFileSync(plan, "utf8"), /- \[\/\] #acme:5 interviews\n/);

    const { plans } = await call("get_scope_plan", { scope: "acme" });
    assert.deepEqual(plans.map((p: { note: string }) => p.note), ["Plan.md"]);
    assert.deepEqual(
      plans[0].items.map((t: { status: string; key?: string; progress?: string; section: string }) => [t.status, t.key, t.progress, t.section]),
      [["in_progress", "#acme:5", "1/2", "Phase 1"], ["done", undefined, undefined, "Phase 1"], ["open", undefined, undefined, "Phase 1"]],
    );
    assert.equal((await call("list_tasks", { from: DAY, status: "in_progress" })).length, 0, "in progress lives in the plan, not in the day");
  });

  it("reports a scope: its plan and its tasks of the last days, private lines left out (spec 2026-11-13)", async () => {
    const { call, repo } = await connect();
    await call("create_scope", { name: "acme" });
    writeFileSync(path.join(repo, "scopes/acme/Plan.md"), "# Plan\n\n## Phase 1\n- [/] #acme:5 interviews\n");
    await call("add_task", { date: "today", text: "#acme:5 interviews" });
    await call("add_task", { date: "today", text: "#acme secret #private" });
    const { markdown } = await call("get_scope_report", { scope: "acme", days: 7 });
    assert.match(markdown, /^# #acme\n\nPlan: 0 open, 1 in progress, 0 done\./);
    assert.match(markdown, /#### Phase 1\n\n- \[\/\] #acme:5 interviews\n/);
    assert.match(markdown, /### \[\d{4}-\d{2}-\d{2}\]\(\d{4}\/\d{2}\/[\d-]+\.md\)\n\n- \[ \] #acme:5 interviews\n/);
    assert.ok(!markdown.includes("secret"), markdown);
  });

  it("renders a task or memo of a scope with the templates of the scope (spec 2026-11-13)", async () => {
    const { call, file } = await connect("full", {}, {
      "journal.scopes": [{ name: "acme", templates: [{ name: "task", template: "- [ ] ACME ${input}", after: "## Tasks" }] }],
    });
    await call("add_task", { date: DAY, text: "interview", scope: "acme" });
    await call("add_task", { date: DAY, text: "call the bank" });
    assert.match(file(DAY), /## Tasks\n- \[ \] ACME #acme:1 interview\n- \[ \] call the bank\n/);
  });

  it("treats a private scope as write-only and hides links to it", async () => {
    const { call, file, repo } = await connect();
    await call("create_scope", { name: "private" });
    await call("create_scope", { name: "work" });
    await call("create_note", { scope: "private", title: "Arzt", content: "secret", date: DAY });
    await call("create_note", { scope: "work", title: "Plan", content: "public", date: DAY });
    assert.ok(existsSync(path.join(repo, "scopes/private/Arzt.md")));
    assert.match(file(DAY), /scopes\/private\/Arzt\.md/);

    assert.deepEqual(
      (await call("list_scopes", {})).map((s: { name: string }) => s.name),
      ["work"],
    );
    await assert.rejects(call("list_notes", { scope: "private" }), /Unknown scope/);
    await assert.rejects(call("get_note", { scope: "private", note: "Arzt.md" }), /Unknown scope/);
    const day = JSON.stringify(await call("get_daily_journal", { date: DAY }));
    assert.doesNotMatch(day, /Arzt/);
    assert.match(day, /Plan/);
  });

  it("lets the write-only token create scopes and notes without reading anything back", async () => {
    const { call } = await connect("write");
    await call("create_scope", { name: "vera" });
    assert.deepEqual(await call("create_note", { scope: "vera", title: "Idee", content: "x", date: DAY }), {
      created: true,
    });
  });

  it("blocks reading notes when notes are not readable", async () => {
    const { call } = await connect("full", { NOTES_READABLE: "false" });
    await call("create_scope", { name: "vera" });
    await call("create_note", { scope: "vera", title: "Idee", content: "x", link: false });
    await assert.rejects(call("get_note", { scope: "vera", note: "Idee.md" }), /not readable/);
    assert.deepEqual((await call("list_notes", { scope: "vera" })).notes, [{ note: "Idee.md" }]);
  });

  it("stores titles with characters that are special in URLs and markdown", async () => {
    const { call, file } = await connect();
    await call("create_scope", { name: "work" });
    const result = await call("create_note", { scope: "work", title: "50% Plan (v2)", content: "x", date: DAY });
    assert.equal(result.note, "50%_Plan_(v2).md");
    // a plain link, as the extension writes it
    assert.match(file(DAY), /- NOTE: \[50% Plan \(v2\)\]\(\.\.\/\.\.\/scopes\/work\/50%_Plan_\(v2\)\.md\)/);
  });

  it("does not reveal existing notes of a private scope", async () => {
    for (const access of ["write", "full"] as const) {
      const { call, repo } = await connect(access);
      await call("create_scope", { name: "private" });
      const first = await call("create_note", { scope: "private", title: "Arzt", content: "one", link: false });
      const second = await call("create_note", { scope: "private", title: "Arzt", content: "two", link: false });
      assert.deepEqual(first, second, `${access}: identical answers`);
      assert.deepEqual(second, { created: true }, `${access}: no path in the answer`);
      assert.match(readFileSync(path.join(repo, "scopes/private/Arzt.md"), "utf8"), /one/, `${access}: first kept`);
      assert.match(
        readFileSync(path.join(repo, "scopes/private/Arzt-2.md"), "utf8"),
        /two/,
        `${access}: second stored`,
      );
    }
  });
});

describe("note rendering", () => {
  it("renders the note template with title, tags and body", () => {
    assert.equal(
      renderNote(
        "# ${input}\n\n${tags}\n",
        " Idee ",
        ["vera", "#konzept", ""],
        "Text\r\n",
        dayMoment("2026-10-09", "en"),
      ),
      "# Idee\n\n#vera #konzept\n\nText\n",
    );
  });

  it("builds a plain relative link, as the extension writes it", () => {
    const { line, link } = noteLink("- NOTE: [${title}](${link})", "/j/2026/10", "/j/scopes/a b/50%_x.md", "md");
    assert.equal(link, "../../scopes/a b/50%_x.md");
    assert.equal(line, "- NOTE: [50% x](../../scopes/a b/50%_x.md)");
  });

  it("finds a free file name", async () => {
    const taken = new Set(["/s/a.md", "/s/a-2.md"]);
    assert.equal(await uniqueFile("/s/a.md", async (f) => taken.has(f)), "/s/a-3.md");
    assert.equal(await uniqueFile("/s/b.md", async (f) => taken.has(f)), "/s/b.md");
  });
});
