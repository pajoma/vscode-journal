/**
 * The tool list is the server's API: names, input schemas, annotations and
 * descriptions per access level, compared with tool-list.snapshot.json. An
 * intended change: run with UPDATE_SNAPSHOT=1 and review the diff of the file.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { connect } from "./connect.js";

const SNAPSHOT = path.join(import.meta.dirname, "tool-list.snapshot.json");

describe("tool list (#282)", () => {
  it("matches the snapshot for both access levels", async () => {
    const actual: Record<string, unknown> = {};
    for (const access of ["full", "write"] as const) {
      const { client } = await connect(access);
      // as JSON, the form clients see (no undefined fields)
      actual[access] = JSON.parse(JSON.stringify((await client.listTools()).tools));
    }
    if (process.env.UPDATE_SNAPSHOT) writeFileSync(SNAPSHOT, `${JSON.stringify(actual, null, 2)}\n`);
    assert.deepEqual(actual, JSON.parse(readFileSync(SNAPSHOT, "utf8")));
  });
});
