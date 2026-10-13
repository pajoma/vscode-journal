/** What every tool module gets: the server, the store, the configuration and the shared helpers and arguments. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type moment from "moment";
import { z } from "zod";

import type { Config } from "../config.js";
import { dateRange, resolveDate as resolveDay } from "../dates.js";
import * as journal from "../journal/index.js";
import { privateLinks, Scopes } from "../scopes.js";
import type { EntryId, JournalStore, Period } from "../store.js";
import { nowMoment, replaceVariable, resolveDate } from "../template.js";

/** Token access: "full": all tools. "write": may only add (tasks, memos, time entries, notes, scopes), nothing is read back. */
export type Access = "full" | "write";

/** Runs a tool and returns its result as JSON text, or the error message. */
export async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }] };
  }
}

/** Arguments several tools share. */
export const args = {
  date: z.string().optional().describe("YYYY-MM-DD, 'today', 'yesterday' or 'tomorrow' (default: today)"),
  period: z
    .enum(["daily", "weekly"])
    .optional()
    .describe("'daily' (default): the day's entry; 'weekly': the weekly entry of the week containing 'date'"),
  ref: z.string().describe("Temporary ref of the entry, as returned by a read tool"),
  range: {
    from: z.string().optional().describe("First day, YYYY-MM-DD or keyword (default: today)"),
    to: z.string().optional().describe("Last day, inclusive (default: same as 'from'); max. 92 days"),
  },
};

export interface ToolContext {
  server: McpServer;
  store: JournalStore;
  cfg: Config;
  scopes: Scopes;
  /** All tools ("full" access), or only the adding ones ("write"). */
  full: boolean;
  /** The server's only way to read content: lines seen through its policy (#256). */
  view: (lines: journal.Lines) => journal.VisibleLines;
  /** Current time in the journal's timezone and locale. */
  now: () => moment.Moment;
  /** A day argument (YYYY-MM-DD or keyword) as YYYY-MM-DD. */
  day: (value?: string) => string;
  /** The entry of a day argument. */
  id: (value?: string, period?: Period) => EntryId;
  /** The days of a range argument. */
  days: (from?: string, to?: string) => string[];
  /** A memo/task line rendered from the user's template, like the extension does. */
  render: (name: "memo" | "task", input: string) => { line: string; template: string; after: string };
}

export function createToolContext(server: McpServer, store: JournalStore, cfg: Config, access: Access): ToolContext {
  const settings = cfg.journal;
  const scopes = new Scopes(cfg);
  const policy: journal.Policy = {
    privateTags: cfg.privateTags,
    notesReadable: cfg.notesReadable,
    // links from entries to notes in private scopes are hidden like #private lines
    privateLinks: privateLinks(cfg, scopes),
  };
  const now = () => nowMoment(cfg.timezone, settings.getLocale());
  const day = (value?: string) => resolveDay(value, cfg.timezone);
  return {
    server,
    store,
    cfg,
    scopes,
    full: access === "full",
    view: (lines) => journal.visible(lines, policy),
    now,
    day,
    id: (value, period = "daily") => ({ period, date: day(value) }),
    days: (from, to) => {
      const start = day(from);
      return dateRange(start, to ? day(to) : start);
    },
    render: (name, input) => {
      const tpl = name === "memo" ? settings.getMemoInlineTemplate() : settings.getTaskInlineTemplate();
      return { ...tpl, line: resolveDate(replaceVariable(tpl.template, "input", input.trim()), now()) };
    },
  };
}
