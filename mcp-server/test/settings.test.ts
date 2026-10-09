import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { loadConfig } from "../src/config.js";
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
    assert.equal(new JournalStore(cfg, null).entryPath("2026-10-09"), "2026/10/2026-10-09.md");
  });

  it("uses the extension defaults without settings", () => {
    const cfg = loadConfig({ JOURNAL_REPO_PATH: "/tmp/journal" });
    assert.equal(new JournalStore(cfg, null).entryPath("2026-10-09"), "2026/10/09.md");
    assert.equal(cfg.journal.template("task").template, "- [] ${d:LL} - Task: ${input}");
    assert.equal(cfg.journal.template("task").after, "## Tasks");
  });

  it("resolves a relative journal.base inside the repository and rejects one outside", () => {
    assert.equal(
      new JournalStore(configWith(`{"journal.base": "journal"}`), null).entryPath("2026-10-09"),
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
});
