import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { Config } from "./config.js";
import { dateRange, resolveDate } from "./dates.js";
import * as journal from "./journal.js";
import type { JournalStore } from "./store.js";

const INSTRUCTIONS = `Tools for a personal markdown journal with one file per day.
Workflow for changes to existing entries: read first (get_daily_journal, list_tasks, list_time_entries),
pick the entry yourself, ask the user if several entries match, then call the update tool with the
returned "ref". Refs are temporary: after any change to the same line they become stale and the
tool returns an error; read again in that case. Dates are YYYY-MM-DD or today / yesterday / tomorrow.
Content the user tagged as private is never returned by this server.`;

/** "full": all tools. "write": may only add tasks, time entries and notes, nothing is read back. */
export type Scope = "full" | "write";

async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }] };
  }
}

export function createMcpServer(store: JournalStore, cfg: Config, scope: Scope = "full"): McpServer {
  const server = new McpServer({ name: "journal", version: "0.1.0" }, { instructions: INSTRUCTIONS });
  const tz = cfg.timezone;
  const policy: journal.Policy = { privateTags: cfg.privateTags, notesReadable: cfg.notesReadable };
  const full = scope === "full";

  const date = z.string().optional().describe("YYYY-MM-DD, 'today', 'yesterday' or 'tomorrow' (default: today)");
  const ref = z.string().describe("Temporary ref of the entry, as returned by a read tool");
  const range = {
    from: z.string().optional().describe("First day, YYYY-MM-DD or keyword (default: today)"),
    to: z.string().optional().describe("Last day, inclusive (default: same as 'from'); max. 92 days"),
  };
  const days = (from?: string, to?: string) => {
    const start = resolveDate(from, tz);
    return dateRange(start, to ? resolveDate(to, tz) : start);
  };

  if (full) {
    server.registerTool(
      "get_daily_journal",
      {
        title: "Get daily journal",
        description: "Returns one day's entry structured as tasks, time entries and notes.",
        inputSchema: { date },
        annotations: { readOnlyHint: true },
      },
      ({ date }) =>
        run(async () => {
          const entry = await store.read(resolveDate(date, tz));
          return {
            date: entry.date,
            path: entry.path,
            exists: entry.exists,
            tasks: journal.listTasks(entry.lines, policy),
            time_entries: journal.listTimeEntries(entry.lines, policy),
            notes: cfg.notesReadable ? journal.readNotes(entry.lines, policy) : "not readable (server configuration)",
          };
        }),
    );

    server.registerTool(
      "list_tasks",
      {
        title: "List tasks",
        description: "Lists checklist tasks over a date range, with the heading each task is listed under.",
        inputSchema: {
          ...range,
          status: z.enum(["open", "done", "all"]).optional().describe("Default: open"),
        },
        annotations: { readOnlyHint: true },
      },
      ({ from, to, status = "open" }) =>
        run(async () => {
          const entries = await store.readMany(days(from, to));
          return entries.flatMap((e) =>
            journal
              .listTasks(e.lines, policy)
              .filter((t) => status === "all" || t.done === (status === "done"))
              .map((t) => ({ date: e.date, ...t })),
          );
        }),
    );
  }

  server.registerTool(
    "add_task",
    {
      title: "Add task",
      description: "Adds an open task to the Tasks section of a day.",
      inputSchema: { date, text: z.string().describe("Task text, single line") },
    },
    ({ date, text }) =>
      run(() => store.modify(resolveDate(date, tz), "add task", (lines) => ({ ref: journal.addTask(lines, text) }))),
  );

  if (full) {
    server.registerTool(
      "update_task",
      {
        title: "Update task",
        description: "Marks a task as done or open, and/or rewords it.",
        inputSchema: {
          date,
          ref,
          done: z.boolean().optional().describe("true = completed, false = reopen"),
          text: z.string().optional().describe("New task text"),
        },
      },
      ({ date, ref, done, text }) =>
        run(() =>
          store.modify(resolveDate(date, tz), "update task", (lines) => ({
            ref: journal.updateTask(lines, ref, { done, text }, policy),
          })),
        ),
    );

    server.registerTool(
      "list_time_entries",
      {
        title: "List time entries",
        description: "Lists time tracking rows (Zeiterfassung) over a date range, with hours per project.",
        inputSchema: {
          ...range,
          project: z.string().optional().describe("Only projects containing this text (case-insensitive)"),
        },
        annotations: { readOnlyHint: true },
      },
      ({ from, to, project }) =>
        run(async () => {
          const entries = await store.readMany(days(from, to));
          const needle = project?.toLowerCase();
          const rows = entries.flatMap((e) =>
            journal
              .listTimeEntries(e.lines, policy)
              .filter((t) => !needle || t.project.toLowerCase().includes(needle))
              .map((t) => ({ date: e.date, ...t })),
          );
          const totals: Record<string, number> = {};
          for (const r of rows) totals[r.project] = (totals[r.project] ?? 0) + (r.hours ?? 0);
          return { entries: rows, hours_by_project: totals };
        }),
    );
  }

  const timeFields = {
    start: z.string().describe("HH:MM"),
    end: z.string().describe("HH:MM, after start"),
    project: z.string().describe("Customer / project"),
    description: z.string().describe("Activity"),
  };

  server.registerTool(
    "add_time_entry",
    {
      title: "Add time entry",
      description: "Adds a time interval to a day's Zeiterfassung table. Overlaps are reported as warnings.",
      inputSchema: { date, ...timeFields },
    },
    ({ date, ...input }) =>
      run(() =>
        store.modify(resolveDate(date, tz), `time ${input.start}-${input.end} ${input.project}`, (lines) => {
          const result = journal.addTimeEntry(lines, input, policy);
          // a write-only client must not learn about existing entries through warnings
          return full ? result : { ref: result.ref, overlapping_entries: result.warnings.length };
        }),
      ),
  );

  if (full) {
    server.registerTool(
      "update_time_entry",
      {
        title: "Update time entry",
        description: "Corrects fields of an existing time entry; omitted fields stay unchanged.",
        inputSchema: {
          date,
          ref,
          start: timeFields.start.optional(),
          end: timeFields.end.optional(),
          project: timeFields.project.optional(),
          description: timeFields.description.optional(),
        },
      },
      ({ date, ref, ...change }) =>
        run(() =>
          store.modify(resolveDate(date, tz), "update time entry", (lines) =>
            journal.updateTimeEntry(lines, ref, change, policy),
          ),
        ),
    );
  }

  server.registerTool(
    "add_note",
    {
      title: "Add note",
      description: "Appends markdown to the end of a day's notes, optionally under a new heading.",
      inputSchema: {
        date,
        content: z.string().describe("Markdown content"),
        heading: z.string().optional().describe("Optional heading for the new note"),
        level: z.number().int().min(2).max(6).optional().describe("Heading level, default 2"),
      },
    },
    ({ date, content, heading, level }) =>
      run(() =>
        store.modify(resolveDate(date, tz), heading ? `note ${heading}` : "add note", (lines) => {
          journal.addNote(lines, content, heading, level, policy);
          return {};
        }),
      ),
  );

  if (full) {
    server.registerTool(
      "append_note",
      {
        title: "Append to note",
        description: "Appends markdown to the end of an existing heading's block in the notes area.",
        inputSchema: {
          date,
          heading: z.string().describe("Existing heading text, exactly as listed by get_daily_journal"),
          content: z.string().describe("Markdown content"),
        },
      },
      ({ date, heading, content }) =>
        run(() =>
          store.modify(resolveDate(date, tz), `append ${heading}`, (lines) => {
            journal.appendNote(lines, heading, content, policy);
            return {};
          }),
        ),
    );
  }

  return server;
}
