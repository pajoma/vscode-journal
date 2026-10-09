import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { loadConfig } from "../src/config.js";
import { checkTokens, createHttpHandler } from "../src/http-app.js";
import { createStore } from "../src/store.js";

const FULL = "f".repeat(64);
const WRITE = "w".repeat(64);

describe("http endpoint", () => {
  let server: http.Server;
  let base: string;

  before(async () => {
    const repo = mkdtempSync(path.join(tmpdir(), "journal-mcp-http-"));
    const cfg = loadConfig({ JOURNAL_REPO_PATH: repo, MCP_AUTH_TOKEN: FULL, MCP_WRITE_TOKEN: WRITE });
    server = http.createServer(createHttpHandler(cfg, createStore(cfg)));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const listTools = (headers: Record<string, string> = {}, query = "") =>
    fetch(`${base}/mcp${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
  const toolNames = async (res: Response) =>
    ((await res.json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name).sort();

  it("serves /healthz without a token", async () => {
    const res = await fetch(`${base}/healthz`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "ok");
  });

  it("rejects requests without or with a wrong token", async () => {
    assert.equal((await listTools()).status, 401, "no token");
    assert.equal((await listTools({ Authorization: `Bearer ${"x".repeat(64)}` })).status, 401, "wrong bearer token");
    assert.equal((await listTools({}, `?token=${"x".repeat(64)}`)).status, 401, "wrong query token");
  });

  it("accepts the full token as bearer header and as query parameter", async () => {
    const viaHeader = await listTools({ Authorization: `Bearer ${FULL}` });
    assert.equal(viaHeader.status, 200);
    assert.ok((await toolNames(viaHeader)).includes("get_daily_journal"), "full token sees read tools");
    assert.equal((await listTools({}, `?token=${FULL}`)).status, 200, "query token");
  });

  it("limits the write token to adding tools", async () => {
    const res = await listTools({ Authorization: `Bearer ${WRITE}` });
    assert.equal(res.status, 200);
    assert.deepEqual(await toolNames(res), ["add_memo", "add_note", "add_task", "add_time_entry", "create_note", "create_scope"]);
  });

  it("only allows POST on /mcp", async () => {
    const res = await fetch(`${base}/mcp`, { headers: { Authorization: `Bearer ${FULL}` } });
    assert.equal(res.status, 405);
  });
});

describe("token configuration", () => {
  const cfg = (env: Record<string, string>) => loadConfig({ JOURNAL_REPO_PATH: "/tmp/j", ...env });
  it("requires a full token of at least 32 characters", () => {
    assert.match(checkTokens(cfg({})) ?? "", /MCP_AUTH_TOKEN/);
    assert.match(checkTokens(cfg({ MCP_AUTH_TOKEN: "short" })) ?? "", /MCP_AUTH_TOKEN/);
  });
  it("requires a distinct write token of at least 32 characters", () => {
    assert.match(checkTokens(cfg({ MCP_AUTH_TOKEN: FULL, MCP_WRITE_TOKEN: FULL })) ?? "", /MCP_WRITE_TOKEN/);
    assert.match(checkTokens(cfg({ MCP_AUTH_TOKEN: FULL, MCP_WRITE_TOKEN: "short" })) ?? "", /MCP_WRITE_TOKEN/);
    assert.equal(checkTokens(cfg({ MCP_AUTH_TOKEN: FULL, MCP_WRITE_TOKEN: WRITE })), undefined);
  });
});
