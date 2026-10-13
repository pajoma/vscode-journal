import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { Config } from "./config.js";
import type { JournalStore } from "./store.js";
import { type Access, createToolContext } from "./tools/context.js";
import { registerEntryTools } from "./tools/entries.js";
import { registerNoteTools } from "./tools/notes.js";
import { registerScopeTools } from "./tools/scopes.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerTimeTools } from "./tools/time.js";

export type { Access };

const INSTRUCTIONS = `Tools for a personal markdown journal with one file per day (daily entries) and one file per
week (weekly entries). Tasks, memos and notes live in either; pass period "weekly" to work on the
week that contains the given date. Time entries only exist in daily entries.
Workflow for changes to existing entries: read first (get_daily_journal, get_weekly_journal,
list_tasks, list_time_entries), pick the entry yourself, ask the user if several entries match,
then call the update tool with the returned "ref" and the same period. Refs are temporary: after
any change to the same line they become stale and the tool returns an error; read again then.
Dates are YYYY-MM-DD or today / yesterday / tomorrow. For a morning overview use
get_daily_briefing. Longer documents (concepts, meeting notes) are stored as notes in a scope
(list_scopes, create_note) and linked from the daily entry. Content the user tagged as private is
never returned.
If a result contains "sync": { "saved": true, "pushed": false }, the change IS saved and will be
synchronised later: report it to the user, but do not repeat the call.`;

/** The MCP server with the tools the access allows; each tool group lives in its own module under tools/. */
export function createMcpServer(store: JournalStore, cfg: Config, access: Access = "full"): McpServer {
  const server = new McpServer({ name: "journal", version: "0.1.0" }, { instructions: INSTRUCTIONS });
  const ctx = createToolContext(server, store, cfg, access);
  registerEntryTools(ctx);
  registerTaskTools(ctx);
  registerTimeTools(ctx);
  registerNoteTools(ctx);
  registerScopeTools(ctx);
  return server;
}
