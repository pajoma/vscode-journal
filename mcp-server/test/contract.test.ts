/**
 * The MCP server mirrors the extension's settings defaults and format rules
 * (#250). These tests read the extension's sources and the shared fixture
 * cases, which the extension's own test suite runs too, so the copies cannot
 * drift unnoticed.
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

import { Scopes } from "../src/scopes.js";
import { CODE_DEFAULTS, PACKAGE_DEFAULTS, type TemplateName } from "../src/settings.js";
import { createStore } from "../src/store.js";
import { dayMoment, resolveDate } from "../src/template.js";

const ROOT = path.resolve(import.meta.dirname, "../..");

function manifestDefaults(): Record<string, unknown> {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const sections = Array.isArray(pkg.contributes.configuration)
    ? pkg.contributes.configuration
    : [pkg.contributes.configuration];
  const defaults: Record<string, unknown> = {};
  for (const section of sections) {
    for (const [key, schema] of Object.entries<{ default?: unknown }>(section.properties)) {
      if (key.startsWith("journal.")) defaults[key.slice("journal.".length)] = schema.default;
    }
  }
  return defaults;
}

describe("contract with the extension (#250)", () => {
  const manifest = manifestDefaults();

  it("uses the package.json defaults of the extension", () => {
    for (const [key, value] of Object.entries(PACKAGE_DEFAULTS)) {
      assert.ok(key in manifest, `journal.${key} is not declared in package.json`);
      if (key === "patterns") {
        // only the patterns the MCP server resolves
        const own = value as Record<string, unknown>;
        const theirs = manifest.patterns as Record<string, unknown>;
        for (const kind of Object.keys(own)) assert.deepEqual(own[kind], theirs[kind], `journal.patterns.${kind}`);
      } else if (key === "templates") {
        const theirs = manifest.templates as { name: string }[];
        for (const tpl of value as { name: string }[]) {
          assert.deepEqual(
            tpl,
            theirs.find((t) => t.name === tpl.name),
            `journal.templates "${tpl.name}"`,
          );
        }
      } else if (key === "scopes") {
        // the manifest default "{}" is invalid for an array; both read it as "no scopes"
        assert.ok(Array.isArray(manifest.scopes) ? manifest.scopes.length === 0 : true, "journal.scopes");
      } else {
        assert.deepEqual(value, manifest[key], `journal.${key}`);
      }
    }
  });

  it("uses the code fallbacks of the extension's TemplateProvider", () => {
    const source = readFileSync(path.join(ROOT, "src/shared/config/template-provider.ts"), "utf8");
    const fallbacks = new Map(
      [...source.matchAll(/loadInlineTemplate\("(\w+)", ("(?:[^"\\]|\\.)*")/g)].map((m) => [m[1], JSON.parse(m[2])]),
    );
    for (const [name, template] of Object.entries(CODE_DEFAULTS)) {
      assert.ok(fallbacks.has(name), `TemplateProvider has no fallback for "${name}"`);
      assert.equal(template, fallbacks.get(name as TemplateName), `fallback of "${name}"`);
    }
  });
});

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
  fixtures: ["$comment", "date", "entries", "weeks", "notes", "filenames", "templates", "weeklyTemplates", "reopenTasks"],
  entries: ["name", "settings", "expected"],
  weeks: ["name", "settings", "date", "week", "expected"],
  notes: ["name", "settings", "folders", "scope", "title", "expected"],
  templates: ["template", "locale", "expected"],
  weeklyTemplates: ["name", "settings", "date", "expected"],
};

describe("shared journal format cases (#250)", () => {
  it("knows every field of the cases", () => {
    const unknown = (keys: string[], known: string[]) => keys.filter((k) => !known.includes(k));
    assert.deepEqual(unknown(Object.keys(FIXTURES), KNOWN_FIELDS.fixtures), [], "top level");
    for (const section of ["entries", "weeks", "notes", "templates", "weeklyTemplates"] as const) {
      for (const c of FIXTURES[section]) assert.deepEqual(unknown(Object.keys(c), KNOWN_FIELDS[section]), [], `${section}: ${JSON.stringify(c)}`);
    }
  });

  for (const c of FIXTURES.entries) {
    it(`entry path: ${c.name}`, () => {
      assert.equal(journal(c.settings).store.entryPath({ period: "daily", date: FIXTURES.date }), c.expected);
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
      const file = scopes.notePath(scope, c.title, dayMoment(FIXTURES.date, cfg.journal.locale));
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
});
