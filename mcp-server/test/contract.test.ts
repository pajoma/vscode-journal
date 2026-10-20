/**
 * The MCP server resolves the journal format with journal-core, like the
 * extension (#250). These shared fixture cases run in the extension's test
 * suite too, so both write the same files.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { loadConfig } from "../src/config.js";
import { normalizeFilename } from "journal-core";

import { lineRef } from "../src/journal/lines.js";
import { updateTask, visible } from "../src/journal/index.js";
import { linkTargets } from "../src/journal/structure.js";

import { noteLink, renderNote, Scopes } from "../src/scopes.js";
import { createStore } from "../src/store.js";
import { dayMoment, resolveDate } from "../src/template.js";

const ROOT = path.resolve(import.meta.dirname, "../..");

interface Case {
  name: string;
  settings: Record<string, unknown>;
  expected: string;
}

interface Fixtures {
  date: string;
  entries: Case[];
  weeks: (Case & { date: string; week: number })[];
  notes: (Case & { scope: string; title: string; folders?: string[] })[];
  filenames: [string, string][];
  templates: { template: string; locale: string; expected: string }[];
  weeklyTemplates: (Case & { date: string })[];
  reopenTasks: [string, string][];
  noteHeaders: { name: string; template: string; title: string; tags: string[]; locale: string; expected: string }[];
  fileLinks: { name: string; from: string; file: string; ext: string; expected: string }[];
  linkTargets: { name: string; line: string; expected: string[] }[];
  layouts: (Case & { existing: string[]; period?: "daily" | "weekly" })[];
}

const FIXTURES: Fixtures = JSON.parse(readFileSync(path.join(ROOT, "src/test/fixtures/journal-format.json"), "utf8"));

/** A journal repository with the given settings (keys without "journal."); the base is the repository. */
function journal(settings: Record<string, unknown>, folders: string[] = []) {
  const dir = mkdtempSync(path.join(tmpdir(), "journal-mcp-contract-"));
  const repo = path.join(dir, "repo");
  for (const folder of folders) mkdirSync(path.join(repo, "scopes", folder), { recursive: true });
  mkdirSync(repo, { recursive: true });
  const file = path.join(dir, "settings.json");
  writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(settings).map(([k, v]) => [`journal.${k}`, v]))));
  const cfg = loadConfig({ JOURNAL_REPO_PATH: repo, JOURNAL_SETTINGS: file });
  return { cfg, repo, store: createStore(cfg), scopes: new Scopes(cfg) };
}

/** The fields each runner handles; a new field must be handled here and in src/test/suite/journal-format.test.ts. */
const KNOWN_FIELDS: Record<string, string[]> = {
  fixtures: [
    "$comment",
    "date",
    "entries",
    "weeks",
    "notes",
    "filenames",
    "templates",
    "weeklyTemplates",
    "reopenTasks",
    "noteHeaders",
    "fileLinks",
    "linkTargets",
    "layouts",
  ],
  entries: ["name", "settings", "expected"],
  weeks: ["name", "settings", "date", "week", "expected"],
  notes: ["name", "settings", "folders", "scope", "title", "expected"],
  templates: ["template", "locale", "expected"],
  weeklyTemplates: ["name", "settings", "date", "expected"],
  noteHeaders: ["name", "template", "title", "tags", "locale", "expected"],
  fileLinks: ["name", "from", "file", "ext", "expected"],
  linkTargets: ["name", "line", "expected"],
  layouts: ["name", "settings", "period", "existing", "expected"],
};

describe("shared journal format cases (#250)", () => {
  it("knows every field of the cases", () => {
    const unknown = (keys: string[], known: string[]) => keys.filter((k) => !known.includes(k));
    assert.deepEqual(unknown(Object.keys(FIXTURES), KNOWN_FIELDS.fixtures), [], "top level");
    for (const section of [
      "entries",
      "weeks",
      "notes",
      "templates",
      "weeklyTemplates",
      "noteHeaders",
      "fileLinks",
      "linkTargets",
      "layouts",
    ] as const) {
      for (const c of FIXTURES[section]) assert.deepEqual(unknown(Object.keys(c), KNOWN_FIELDS[section]), [], `${section}: ${JSON.stringify(c)}`);
    }
  });

  for (const c of FIXTURES.entries) {
    it(`entry path: ${c.name}`, () => {
      assert.equal(journal(c.settings).store.entryPath({ period: "daily", date: FIXTURES.date }), c.expected);
    });
  }

  for (const c of FIXTURES.layouts) {
    it(`layouts: ${c.name}`, async () => {
      const { repo, store } = journal(c.settings);
      for (const file of c.existing) {
        mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
        writeFileSync(path.join(repo, file), "# entry\n");
      }
      const entry = await store.read({ period: c.period ?? "daily", date: FIXTURES.date });
      assert.equal(entry.path, c.expected);
      assert.equal(entry.exists, c.existing.length > 0);
    });
  }

  for (const c of FIXTURES.weeks) {
    it(`week path: ${c.name}`, () => {
      const { store } = journal(c.settings);
      assert.equal(store.week(c.date).week, c.week, "week number");
      assert.equal(store.entryPath({ period: "weekly", date: c.date }), c.expected);
    });
  }

  for (const c of FIXTURES.notes) {
    it(`note path: ${c.name}`, () => {
      const { cfg, repo, scopes } = journal(c.settings, c.folders);
      const scope = scopes.get(c.scope);
      assert.ok(scope, `scope ${c.scope}`);
      const file = scopes.notePath(scope, c.title, dayMoment(FIXTURES.date, cfg.journal.getLocale()));
      assert.equal(path.relative(repo, file).split(path.sep).join("/"), c.expected);
    });
  }

  for (const c of FIXTURES.weeklyTemplates) {
    it(`weekly template: ${c.name}`, async () => {
      const { repo, store } = journal(c.settings);
      const id = { period: "weekly" as const, date: c.date };
      await store.modify(id, "create", () => ({}));
      assert.equal(readFileSync(path.join(repo, store.entryPath(id)), "utf8").trimEnd(), c.expected);
    });
  }

  it("file names", () => {
    for (const [input, expected] of FIXTURES.filenames) assert.equal(normalizeFilename(input), expected, input);
  });

  it("reopening a task", () => {
    for (const [line, expected] of FIXTURES.reopenTasks) {
      const lines = [line];
      updateTask(visible(lines, { privateTags: [], notesReadable: true }), lineRef(lines, 0), { done: false }, "");
      assert.equal(lines[0], expected, line);
    }
  });

  it("template variables", () => {
    for (const c of FIXTURES.templates) {
      assert.equal(resolveDate(c.template, dayMoment(FIXTURES.date, c.locale)), c.expected, `${c.template} (${c.locale})`);
    }
  });

  for (const c of FIXTURES.noteHeaders) {
    it(`note header: ${c.name}`, () => {
      assert.equal(renderNote(c.template, c.title, c.tags, "", dayMoment(FIXTURES.date, c.locale)).trimEnd(), c.expected);
    });
  }

  it("file links", () => {
    for (const c of FIXTURES.fileLinks) {
      assert.equal(noteLink("[${title}](${link})", c.from, c.file, c.ext).line, c.expected, c.name);
    }
  });

  it("link targets", () => {
    for (const c of FIXTURES.linkTargets) assert.deepEqual(linkTargets(c.line), c.expected, c.name);
  });
});
