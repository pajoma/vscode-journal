/** An MCP client connected to a server on a fresh journal repository, shared by the tool tests. */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { loadConfig } from "../src/config.js";
import { createMcpServer, type Access } from "../src/server.js";
import { createStore } from "../src/store.js";

const SETTINGS = `{
  "journal.patterns": {
    "entries": { "path": "\${base}/\${year}/\${month}", "file": "\${year}-\${month}-\${day}.\${ext}" },
    "weeks": { "path": "\${base}/\${year}", "file": "\${year}-w\${week}.\${ext}" }
  },
  "journal.templates": [
    { "name": "entry", "template": "# \${d:dddd, MMMM DD YYYY}\\n\\n## Tasks\\n\\n## Notes\\n\\n" },
    { "name": "task", "template": "- [ ] \${input}", "after": "## Tasks" },
    { "name": "memo", "template": "- MEMO \${localTime}: \${input}" },
    { "name": "note", "template": "# \${input}\\n\\n\${tags}\\n" },
    { "name": "files", "template": "- NOTE: [\${title}](\${link})", "after": "## Notes" }
  ]
}`;

export async function connect(access: Access = "full", env: Record<string, string> = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "journal-mcp-tools-"));
  const repo = path.join(dir, "repo");
  mkdirSync(repo);
  writeFileSync(path.join(dir, "settings.json"), SETTINGS);
  const cfg = loadConfig({
    JOURNAL_REPO_PATH: repo,
    JOURNAL_SETTINGS: path.join(dir, "settings.json"),
    NOTES_READABLE: "true",
    ...env,
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createMcpServer(createStore(cfg), cfg, access).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    if (result.isError) throw new Error(result.content[0].text);
    return JSON.parse(result.content[0].text);
  };
  const file = (date: string) =>
    readFileSync(path.join(repo, date.slice(0, 4), date.slice(5, 7), `${date}.md`), "utf8");
  const weekFile = (year: string, week: number) => readFileSync(path.join(repo, year, `${year}-w${week}.md`), "utf8");
  return { client, call, file, weekFile, repo };
}
