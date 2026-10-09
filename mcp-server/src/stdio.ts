// Local mode for VS Code / Claude Code: the client spawns this process, so no token is needed.
// stdout carries the protocol, diagnostics must go to stderr.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config.js";
import { createMcpServer } from "./server.js";
import { createStore } from "./store.js";

const cfg = loadConfig();
const server = createMcpServer(createStore(cfg), cfg);
await server.connect(new StdioServerTransport());
console.error(`journal-mcp (stdio) serving ${cfg.repoPath} (git sync: ${cfg.gitSync})`);
