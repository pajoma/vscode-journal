import { createHash, timingSafeEqual } from "node:crypto";
import type http from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import type { Config } from "./config.js";
import { createMcpServer, type Scope } from "./server.js";
import type { JournalStore } from "./store.js";

/** Returns an error message if the configured tokens are not usable, undefined otherwise. */
export function checkTokens(cfg: Config): string | undefined {
  if (!cfg.authToken || cfg.authToken.length < 32) {
    return "MCP_AUTH_TOKEN must be set to at least 32 characters, e.g. `openssl rand -hex 32`.";
  }
  if (cfg.writeToken !== undefined && (cfg.writeToken.length < 32 || cfg.writeToken === cfg.authToken)) {
    return "MCP_WRITE_TOKEN must have at least 32 characters and differ from MCP_AUTH_TOKEN.";
  }
  return undefined;
}

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Request handler for /mcp and /healthz. Static tokens, accepted as
 * "Authorization: Bearer <token>" or, for clients that only take a URL, as
 * "?token=<token>". The token decides the scope.
 */
export function createHttpHandler(
  cfg: Config,
  store: JournalStore,
): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  const error = checkTokens(cfg);
  if (error) throw new Error(error);
  const tokens: [Buffer, Scope][] = [[digest(cfg.authToken!), "full"]];
  if (cfg.writeToken) tokens.push([digest(cfg.writeToken), "write"]);

  const scopeOf = (req: http.IncomingMessage, url: URL): Scope | undefined => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : url.searchParams.get("token");
    if (!token) return undefined;
    const actual = digest(token);
    return tokens.find(([expected]) => timingSafeEqual(actual, expected))?.[1];
  };

  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    // never log the query string, it may contain the token
    res.on("finish", () => console.log(`${req.method} ${url.pathname} ${res.statusCode}`));

    if (url.pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
      return;
    }
    if (url.pathname !== "/mcp") {
      res.writeHead(404).end();
      return;
    }
    const scope = scopeOf(req, url);
    if (!scope) {
      res.writeHead(401, { "WWW-Authenticate": 'Bearer realm="journal-mcp"' }).end();
      return;
    }
    if (req.method !== "POST") {
      // stateless server: no SSE stream for GET, no sessions to DELETE
      res.writeHead(405, { Allow: "POST" }).end();
      return;
    }

    const server = createMcpServer(store, cfg, scope);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (e) {
      console.error("Request failed:", e instanceof Error ? e.message : e);
      if (!res.headersSent) res.writeHead(500).end();
    }
  };
}
