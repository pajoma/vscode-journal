/**
 * The MCP server mirrors the extension's settings defaults (#250). These tests
 * read the extension's sources so the copies cannot drift unnoticed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { CODE_DEFAULTS, PACKAGE_DEFAULTS, type TemplateName } from "../src/settings.js";

const ROOT = path.resolve(import.meta.dirname, "../..");

/** Keys the MCP server knows that the extension's manifest does not declare yet (remove once merged). */
const NOT_YET_IN_MANIFEST = new Set(["scopeRoot"]); // added to package.json in #249

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
      if (!(key in manifest)) {
        assert.ok(NOT_YET_IN_MANIFEST.has(key), `journal.${key} is not declared in package.json`);
        continue;
      }
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
