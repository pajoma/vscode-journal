import http from "node:http";

import { loadConfig } from "./config.js";
import { checkTokens, createHttpHandler } from "./http-app.js";
import { createStore } from "./store.js";

const cfg = loadConfig();
const error = checkTokens(cfg);
if (error) {
  console.error(error);
  process.exit(1);
}

const httpServer = http.createServer(createHttpHandler(cfg, createStore(cfg)));

httpServer.listen(cfg.port, cfg.host, () => {
  console.log(
    `journal-mcp listening on http://${cfg.host}:${cfg.port}/mcp (git sync: ${cfg.gitSync}, notes readable: ${cfg.notesReadable}, write-only token: ${!!cfg.writeToken})`,
  );
});
