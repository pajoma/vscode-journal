import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { connect } from "./tools.test.js";

const DAY = "2026-10-09";

describe("scopes", () => {
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
});
