import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadConfig } from "../src/config.js";
import {
  addNote,
  addTask,
  addTimeEntry,
  appendNote,
  fromLines,
  listTasks,
  listTimeEntries,
  newEntry,
  type Policy,
  visible,
  readNotes,
  StaleRefError,
  toLines,
  updateTask,
  updateTimeEntry,
} from "../src/journal/index.js";
// internals, deliberately not part of the journal module's public API
import { lineRef } from "../src/journal/lines.js";
import { privateMask } from "../src/journal/privacy.js";

const NOW = "2026-10-09 08:30";

/** Tests only: #private hidden, notes readable. The server builds its policy from the configuration. */
const DEFAULT_POLICY: Policy = { privateTags: ["private", "privat"], notesReadable: true };

/** Lines as seen through a policy (default: #private hidden, notes readable). */
const v = (lines: string[], policy: Policy = DEFAULT_POLICY) => visible(lines, policy);

const SAMPLE = `# Wednesday, October 07 2026

## Tasks
- [ ] Prepare package for project XY
- [x] Review architecture
- [] Default template task
- [ ]

## Zeiterfassung

| Von   | Bis   | Zeit  | Kunde/Projekt | Tätigkeit |
|-------|-------|-------|--------------|-----------|
| 09:00 | 10:00 | 1.0h | Project XY | Architecture |

## Notes

## Meeting A
first line

## Meeting B
- [ ] follow up with team
`;

describe("tasks", () => {
  it("lists tasks with section context and skips empty placeholders", () => {
    const tasks = listTasks(v(toLines(SAMPLE)));
    assert.deepEqual(
      tasks.map((t) => [t.text, t.status, t.section]),
      [
        ["Prepare package for project XY", "open", "Tasks"],
        ["Review architecture", "done", "Tasks"],
        ["Default template task", "open", "Tasks"],
        ["follow up with team", "open", "Meeting B"],
      ],
    );
  });

  it("adds a task after the last task of the Tasks section", () => {
    const lines = toLines(SAMPLE);
    addTask(lines, "- [ ] New one", "## Tasks");
    assert.equal(lines[6], "- [ ] New one");
  });

  it("creates the Tasks section below the title if missing", () => {
    const lines = toLines("# Title\n\n## Notes\n");
    addTask(lines, "- [ ] First", "## Tasks");
    assert.equal(fromLines(lines), "# Title\n\n## Tasks\n- [ ] First\n\n## Notes\n");
  });

  it("completes a task by ref and rejects stale refs", () => {
    const lines = toLines(SAMPLE);
    const ref = listTasks(v(lines))[0].ref;
    const done = updateTask(v(lines), ref, { done: true }, NOW);
    assert.equal(lines[3], "- [x] Prepare package for project XY (done: 2026-10-09 08:30)");
    assert.throws(() => updateTask(v(lines), ref, { done: false }, NOW), StaleRefError);
    updateTask(v(lines), done, { done: false }, NOW);
    assert.equal(lines[3], "- [ ] Prepare package for project XY");
  });
});

describe("time entries", () => {
  it("parses the Zeiterfassung table", () => {
    assert.deepEqual(
      listTimeEntries(v(toLines(SAMPLE))).map(({ ref: _, ...e }) => e),
      [{ start: "09:00", end: "10:00", hours: 1, project: "Project XY", description: "Architecture" }],
    );
  });

  it("inserts rows ordered by start time and computes hours", () => {
    const lines = toLines(SAMPLE);
    addTimeEntry(v(lines), { start: "10:00", end: "11:30", project: "ABC", description: "Sync" });
    addTimeEntry(v(lines), { start: "8:15", end: "9:00", project: "ABC", description: "Mail | inbox" });
    assert.deepEqual(
      listTimeEntries(v(lines)).map((e) => [e.start, e.hours, e.description]),
      [
        ["08:15", 0.75, "Mail | inbox"],
        ["09:00", 1, "Architecture"],
        ["10:00", 1.5, "Sync"],
      ],
    );
    assert.ok(lines.includes("| 08:15 | 09:00 | 0.75h | ABC | Mail \\| inbox |"));
  });

  it("warns about overlaps and validates times", () => {
    const lines = toLines(SAMPLE);
    const { warnings } = addTimeEntry(v(lines), { start: "09:30", end: "10:30", project: "X", description: "y" });
    assert.equal(warnings.length, 1);
    assert.throws(() => addTimeEntry(v(lines), { start: "11:00", end: "10:00", project: "X", description: "y" }));
  });

  it("creates the section before the notes if missing", () => {
    const lines = newEntry("# Thursday, October 08 2026\n\n## Tasks\n\n## Notes\n\n");
    addTimeEntry(v(lines), { start: "09:00", end: "10:00", project: "P", description: "D" });
    assert.equal(
      fromLines(lines),
      `# Thursday, October 08 2026

## Tasks

## Zeiterfassung

${"| Von   | Bis   | Zeit  | Kunde/Projekt | Tätigkeit |"}
${"|-------|-------|-------|--------------|-----------|"}
| 09:00 | 10:00 | 1.0h | P | D |

## Notes

`,
    );
  });

  it("updates single fields of an entry", () => {
    const lines = toLines(SAMPLE);
    const [entry] = listTimeEntries(v(lines));
    updateTimeEntry(v(lines), entry.ref, { end: "10:30" });
    assert.equal(listTimeEntries(v(lines))[0].hours, 1.5);
  });
});

describe("notes", () => {
  it("treats everything below '## Notes' as notes", () => {
    const notes = readNotes(v(toLines(SAMPLE)));
    assert.deepEqual(
      notes.headings.map((h) => h.text),
      ["Meeting A", "Meeting B"],
    );
    assert.match(notes.markdown, /^## Meeting A/);
  });

  it("appends to the block of an existing heading", () => {
    const lines = toLines(SAMPLE);
    appendNote(v(lines), "meeting a", "second line");
    assert.match(fromLines(lines), /## Meeting A\nfirst line\n\nsecond line\n\n## Meeting B/);
  });

  it("reports unknown headings with the available ones", () => {
    assert.throws(() => appendNote(v(toLines(SAMPLE)), "Missing", "x"), /Available: "Meeting A", "Meeting B"/);
  });

  it("adds a note with heading at the end of the file", () => {
    const lines = toLines(SAMPLE);
    addNote(v(lines), "Decision documented.", "Project XY");
    assert.match(fromLines(lines), /- \[ \] follow up with team\n\n## Project XY\n\nDecision documented.\n$/);
  });
});

describe("privacy", () => {
  const PRIVATE = `# Thursday, October 08 2026

## Tasks
- [ ] Public task
- [ ] Doctor appointment #private

## Zeiterfassung

| Von   | Bis   | Zeit  | Kunde/Projekt | Tätigkeit |
|-------|-------|-------|--------------|-----------|
| 09:00 | 10:00 | 1.0h | Project XY | Work |
| 10:00 | 11:00 | 1.0h | Personal | Errand #privat |

## Notes

## Meeting A
public text

## Salary talk #private
secret number
- [ ] secret task

### Details
still secret

## Family
#private #family
secret too
`;
  const strict: Policy = { ...DEFAULT_POLICY, notesReadable: false };

  it("never lists private tasks, rows, headings or note lines", () => {
    const lines = toLines(PRIVATE);
    assert.deepEqual(
      listTasks(v(lines)).map((t) => t.text),
      ["Public task"],
    );
    assert.deepEqual(
      listTimeEntries(v(lines)).map((e) => e.project),
      ["Project XY"],
    );
    const notes = readNotes(v(lines));
    assert.deepEqual(
      notes.headings.map((h) => h.text),
      ["Meeting A"],
    );
    assert.equal(notes.markdown, "## Meeting A\npublic text");
    assert.doesNotMatch(
      JSON.stringify([listTasks(v(lines)), listTimeEntries(v(lines)), notes]),
      /secret|Salary|Family|Errand/,
    );
  });

  it("treats refs to private lines as stale", () => {
    const lines = toLines(PRIVATE);
    const index = lines.indexOf("- [ ] secret task");
    assert.throws(() => updateTask(v(lines), lineRef(lines, index), { done: true }, NOW), StaleRefError);
    const row = lines.findIndex((l) => l.includes("Errand"));
    assert.throws(() => updateTimeEntry(v(lines), lineRef(lines, row), { end: "12:00" }), StaleRefError);
  });

  it("does not reveal private rows in overlap warnings", () => {
    const { warnings } = addTimeEntry(v(toLines(PRIVATE)), {
      start: "10:30",
      end: "11:30",
      project: "X",
      description: "y",
    });
    assert.deepEqual(warnings, []);
  });

  it("cannot append to private headings", () => {
    assert.throws(() => appendNote(v(toLines(PRIVATE)), "Salary talk #private", "x"), /No heading/);
  });

  it("does not append new notes into a trailing private block", () => {
    const lines = toLines(PRIVATE);
    addNote(v(lines), "visible note");
    assert.match(readNotes(v(lines)).markdown, /visible note/);
  });

  it("hides the whole notes area when notes are not readable", () => {
    const lines = toLines(SAMPLE);
    assert.deepEqual(readNotes(v(lines, strict)), { headings: [], markdown: "" });
    assert.deepEqual(
      listTasks(v(lines, strict)).map((t) => t.text),
      ["Prepare package for project XY", "Review architecture", "Default template task"],
    );
    assert.throws(
      () => appendNote(v(lines, strict), "Missing", "x"),
      (e: Error) => !e.message.includes("Meeting"),
    );
  });

  it("always keeps #private, even if PRIVATE_TAGS is empty", () => {
    const cfg = loadConfig({ JOURNAL_REPO_PATH: "/tmp/j", PRIVATE_TAGS: "", NOTES_READABLE: "false" });
    assert.ok(cfg.privateTags.includes("private"));
    assert.equal(cfg.notesReadable, false);
    assert.ok(
      privateMask(["- [ ] x #Secret"], {
        ...DEFAULT_POLICY,
        privateTags: loadConfig({ JOURNAL_REPO_PATH: "/tmp/j", PRIVATE_TAGS: "#secret" }).privateTags,
      })[0],
    );
  });
});

describe("privacy enforcement (#256)", () => {
  it("does not accept raw lines where content is returned", () => {
    const lines = toLines(SAMPLE);
    // @ts-expect-error read functions require VisibleLines, i.e. a policy
    assert.throws(() => listTasks(lines));
    // @ts-expect-error
    assert.throws(() => readNotes(lines));
    // @ts-expect-error
    assert.throws(() => listTimeEntries(lines));
  });

  it("re-evaluates the mask after edits through the same view", () => {
    const view = v(toLines(SAMPLE));
    const [task] = listTasks(view);
    updateTask(view, task.ref, { text: "now secret #private" }, NOW);
    assert.ok(!listTasks(view).some((t) => t.text.includes("secret")));
  });
});

describe("public API of the journal module (#262 review)", () => {
  it("offers no default policy and no raw mask or ref functions", async () => {
    const api = await import("../src/journal/index.js");
    for (const name of ["DEFAULT_POLICY", "privateMask", "resolveRef", "lineRef", "VisibleLines"]) {
      assert.ok(!(name in api), `${name} must not be exported`);
    }
  });
});
