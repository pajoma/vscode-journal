import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { loadConfig } from "../src/config.js";
import { Scopes } from "../src/scopes.js";
import { journalSettings } from "../src/settings.js";
import { JournalStore } from "../src/store.js";
import { dayMoment, resolveDate, templatePattern } from "../src/template.js";

function configWith(settings: string, extraEnv: Record<string, string> = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "journal-mcp-settings-"));
  const file = path.join(dir, "settings.json");
  writeFileSync(file, settings);
  const repo = path.join(dir, "repo");
  return loadConfig({ JOURNAL_SETTINGS: file, JOURNAL_REPO_PATH: repo, ...extraEnv });
}

describe("settings (VS Code format)", () => {
  it("reads JSONC with comments and trailing commas, flat journal.* keys", () => {
    const cfg = configWith(`{
      // VS Code user settings
      "editor.fontSize": 14,
      "journal.patterns": {
        "entries": { "path": "\${base}/\${year}/\${month}", "file": "\${year}-\${month}-\${day}.\${ext}" },
      },
    }`);
    assert.equal(
      new JournalStore(cfg, null).entryPath({ period: "daily", date: "2026-10-09" }),
      "2026/10/2026-10-09.md",
    );
  });

  it("uses the extension defaults without settings", () => {
    const cfg = loadConfig({ JOURNAL_REPO_PATH: "/tmp/journal" });
    assert.equal(new JournalStore(cfg, null).entryPath({ period: "daily", date: "2026-10-09" }), "2026/10/09.md");
    assert.equal(cfg.journal.template("task").template, "- [] ${d:LL} - Task: ${input}");
    assert.equal(cfg.journal.template("task").after, "## Tasks");
  });

  it("resolves weekly entry paths with the locale-aware week and the week-year", () => {
    const defaults = new JournalStore(loadConfig({ JOURNAL_REPO_PATH: "/tmp/journal" }), null);
    assert.equal(defaults.entryPath({ period: "weekly", date: "2026-10-09" }), "2026/week_41.md");
    const custom = new JournalStore(
      configWith(
        `{"journal.patterns": {"weeks": {"path": "\${base}/\${year}", "file": "\${year}-w\${week}.\${ext}"}}}`,
      ),
      null,
    );
    assert.equal(custom.entryPath({ period: "weekly", date: "2026-10-09" }), "2026/2026-w41.md");
    // Thursday, Dec 31 2026 already belongs to week 1 of 2027 (en locale)
    assert.equal(custom.entryPath({ period: "weekly", date: "2026-12-31" }), "2027/2027-w1.md");
    assert.equal(custom.label({ period: "weekly", date: "2026-10-09" }), "2026-W41");
  });

  it("resolves a relative journal.base inside the repository and rejects one outside", () => {
    assert.equal(
      new JournalStore(configWith(`{"journal.base": "journal"}`), null).entryPath({
        period: "daily",
        date: "2026-10-09",
      }),
      "journal/2026/10/09.md",
    );
    assert.throws(() => configWith(`{"journal.base": "/somewhere/else"}`), /must be inside/);
  });

  it("falls back to legacy tpl-* settings and the {content} placeholder like the extension", () => {
    const s = journalSettings({
      "journal.templates": [{ name: "task", template: "- [ ] {content}", after: "## Todo" }],
    });
    assert.deepEqual(s.template("task"), { template: "- [ ] ${input}", after: "## Todo" });
    // journal.templates replaced by the user without a memo entry → tpl-memo default
    assert.equal(s.template("memo").template, "- MEMO: ${input}");
  });

  it("formats dates with moment and the configured locale", () => {
    const s = journalSettings({ "journal.locale": "de" });
    assert.equal(
      resolveDate("${d:dddd, DD. MMMM YYYY} ${weekday}", dayMoment("2026-10-09", s.locale)),
      "Freitag, 09. Oktober 2026 Freitag",
    );
  });

  it("recognises lines produced by a template", () => {
    const pattern = templatePattern("- MEMO ${localTime}: ${input}");
    assert.equal(pattern.exec("- MEMO 9:15 AM: call the bank")?.[1], "call the bank");
    assert.equal(pattern.exec("- [ ] something else"), null);
  });

  it("combines scope folders with journal.scopes overrides", () => {
    const cfg = configWith(`{
      "journal.scopes": [
        { "name": "plan", "patterns": { "notes": { "path": "\${base}/scopes/plan/\${year}", "file": "\${day}-\${input}.\${ext}" } },
          "templates": [{ "name": "note", "template": "# \${input} (Plan)" }] },
        { "name": "clientA", "base": "/somewhere/else" }
      ]
    }`);
    mkdirSync(path.join(cfg.repoPath, "scopes/vera"), { recursive: true });
    mkdirSync(path.join(cfg.repoPath, "scopes/plan"), { recursive: true });
    const scopes = new Scopes(cfg);
    assert.deepEqual(
      scopes.all().map((s) => [s.name, s.source, s.inRepo]),
      [
        ["clientA", "settings", false],
        ["plan", "folder", true],
        ["vera", "folder", true],
      ],
    );
    const plan = scopes.get("#Plan")!;
    assert.equal(
      path.relative(cfg.repoPath, scopes.notePath(plan, "Q4 Ziele", dayMoment("2026-10-09", "en"))),
      "scopes/plan/2026/09-Q4_Ziele.md",
    );
    assert.equal(cfg.journal.template("note", "plan").template, "# ${input} (Plan)");

    // a relative scope root is relative to journal.base
    const nested = configWith(`{"journal.base": "journal", "journal.scopeRoot": "projects"}`);
    assert.equal(path.relative(nested.repoPath, new Scopes(nested).root()), path.join("journal", "projects"));
    assert.equal(cfg.journal.template("note", "vera").template, "# ${input}\n\n${tags}\n");
  });
});
