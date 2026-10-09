import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { Config } from "./config.js";
import { addDays, dateRange, resolveDate as resolveDay } from "./dates.js";
import * as journal from "./journal.js";
import type { TemplateName } from "./settings.js";
import type { JournalStore } from "./store.js";
import { nowMoment, replaceVariable, resolveDate } from "./template.js";

const INSTRUCTIONS = `Tools for a personal markdown journal with one file per day.
Workflow for changes to existing entries: read first (get_daily_journal, list_tasks, list_time_entries),
pick the entry yourself, ask the user if several entries match, then call the update tool with the
returned "ref". Refs are temporary: after any change to the same line they become stale and the
tool returns an error; read again in that case. Dates are YYYY-MM-DD or today / yesterday / tomorrow.
For a morning overview use get_daily_briefing. Content the user tagged as private is never returned.`;

/** "full": all tools. "write": may only add tasks, memos, time entries and notes, nothing is read back. */
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
  const settings = cfg.journal;
  const policy: journal.Policy = { privateTags: cfg.privateTags, notesReadable: cfg.notesReadable };
  const full = scope === "full";

  const now = () => nowMoment(tz, settings.locale);
  /** A memo/task line rendered from the user's template, like the extension does. */
  const render = (name: TemplateName, input: string) => {
    const tpl = settings.template(name);
    return { ...tpl, line: resolveDate(replaceVariable(tpl.template, "input", input.trim()), now()) };
  };

  const date = z.string().optional().describe("YYYY-MM-DD, 'today', 'yesterday' or 'tomorrow' (default: today)");
  const ref = z.string().describe("Temporary ref of the entry, as returned by a read tool");
  const range = {
    from: z.string().optional().describe("First day, YYYY-MM-DD or keyword (default: today)"),
    to: z.string().optional().describe("Last day, inclusive (default: same as 'from'); max. 92 days"),
  };
  const day = (value?: string) => resolveDay(value, tz);
  const days = (from?: string, to?: string) => {
    const start = day(from);
    return dateRange(start, to ? day(to) : start);
  };
  const memos = (lines: journal.Lines) => journal.listMemos(lines, settings.template("memo").template, policy);
  const timeSummary = (rows: { project: string; hours: number | null }[]) => {
    const byProject: Record<string, number> = {};
    for (const r of rows) byProject[r.project] = (byProject[r.project] ?? 0) + (r.hours ?? 0);
    return { total_hours: Object.values(byProject).reduce((a, b) => a + b, 0), hours_by_project: byProject };
  };

  // ------------------------------------------------------------ reading

  if (full) {
    server.registerTool(
      "get_daily_journal",
      {
        title: "Get daily journal",
        description: "Returns one day's entry structured as memos, tasks, time entries and notes.",
        inputSchema: { date },
        annotations: { readOnlyHint: true },
      },
      ({ date }) =>
        run(async () => {
          const entry = await store.read(day(date));
          return {
            date: entry.date,
            path: entry.path,
            exists: entry.exists,
            memos: memos(entry.lines),
            tasks: journal.listTasks(entry.lines, policy),
            time_entries: journal.listTimeEntries(entry.lines, policy),
            notes: cfg.notesReadable ? journal.readNotes(entry.lines, policy) : "not readable (server configuration)",
          };
        }),
    );

    server.registerTool(
      "get_daily_briefing",
      {
        title: "Daily briefing",
        description:
          "Facts for a daily briefing: memos and open tasks of the day, open tasks carried over from previous days, time booked, note topics. Summarise them for the user.",
        inputSchema: {
          date,
          lookback_days: z
            .number()
            .int()
            .min(0)
            .max(31)
            .optional()
            .describe("Previous days to scan for open tasks (default 7)"),
        },
        annotations: { readOnlyHint: true },
      },
      ({ date, lookback_days = 7 }) =>
        run(async () => {
          const target = day(date);
          const entries = await store.readMany(dateRange(addDays(target, -lookback_days), target));
          const today = entries[entries.length - 1];
          const tasks = journal.listTasks(today.lines, policy);
          const time = journal.listTimeEntries(today.lines, policy);
          return {
            date: target,
            entry_exists: today.exists,
            memos: memos(today.lines).map((m) => m.text),
            open_tasks: tasks.filter((t) => t.status === "open"),
            done_tasks: tasks.filter((t) => t.status === "done").map((t) => t.text),
            carried_over: entries.slice(0, -1).flatMap((e) =>
              journal
                .listTasks(e.lines, policy)
                .filter((t) => t.status === "open")
                .map((t) => ({ date: e.date, ...t })),
            ),
            time: { entries: time, ...timeSummary(time) },
            note_topics: cfg.notesReadable ? journal.readNotes(today.lines, policy).headings.map((h) => h.text) : [],
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
          status: z.enum(["open", "done", "moved", "all"]).optional().describe("Default: open"),
        },
        annotations: { readOnlyHint: true },
      },
      ({ from, to, status = "open" }) =>
        run(async () => {
          const entries = await store.readMany(days(from, to));
          return entries.flatMap((e) =>
            journal
              .listTasks(e.lines, policy)
              .filter((t) => status === "all" || t.status === status)
              .map((t) => ({ date: e.date, ...t })),
          );
        }),
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
          return { entries: rows, ...timeSummary(rows) };
        }),
    );
  }

  // -------------------------------------------------------- memos, tasks

  server.registerTool(
    "add_memo",
    {
      title: "Add memo",
      description: "Adds a one-line memo (reminder) to a day, rendered with the user's memo template.",
      inputSchema: { date, text: z.string().describe("Memo text, single line") },
    },
    ({ date, text }) =>
      run(() =>
        store.modify(day(date), "add memo", (lines) => {
          const memo = render("memo", text);
          return { ref: journal.addMemo(lines, memo.line, memo.after, memo.template) };
        }),
      ),
  );

  server.registerTool(
    "add_task",
    {
      title: "Add task",
      description: "Adds an open task to a day, rendered with the user's task template.",
      inputSchema: { date, text: z.string().describe("Task text, single line") },
    },
    ({ date, text }) =>
      run(() =>
        store.modify(day(date), "add task", (lines) => {
          const task = render("task", text);
          return { ref: journal.addTask(lines, task.line, task.after) };
        }),
      ),
  );

  if (full) {
    server.registerTool(
      "update_task",
      {
        title: "Update task",
        description: "Completes a task (adds '(done: <time>)'), reopens it, and/or rewords it.",
        inputSchema: {
          date,
          ref,
          done: z.boolean().optional().describe("true = completed, false = reopen"),
          text: z.string().optional().describe("New task text"),
        },
      },
      ({ date, ref, done, text }) =>
        run(() =>
          store.modify(day(date), "update task", (lines) => ({
            ref: journal.updateTask(lines, ref, { done, text }, now().format("YYYY-MM-DD HH:mm"), policy),
          })),
        ),
    );

    server.registerTool(
      "move_task",
      {
        title: "Move task",
        description:
          "Moves an open task to another day: marks it '[>] ... (moved: <date>)' and adds it to the target day.",
        inputSchema: { date, ref, to: z.string().describe("Target day, YYYY-MM-DD or keyword") },
      },
      ({ date, ref, to }) =>
        run(() => {
          const source = day(date);
          const target = day(to);
          if (source === target) throw new Error("Source and target day are the same");
          return store.modifyMany([source, target], `move task to ${target}`, (entries) => {
            const text = journal.markTaskMoved(
              entries.get(source)!,
              ref,
              target,
              settings.template("task").template,
              policy,
            );
            const task = render("task", text);
            return { text, to: target, ref: journal.addTask(entries.get(target)!, task.line, task.after) };
          });
        }),
    );

    server.registerTool(
      "migrate_open_tasks",
      {
        title: "Migrate open tasks",
        description: "Moves all open tasks of a day to another day (default: the following day).",
        inputSchema: {
          date,
          to: z.string().optional().describe("Target day (default: the day after 'date')"),
        },
      },
      ({ date, to }) =>
        run(() => {
          const source = day(date);
          const target = to ? day(to) : addDays(source, 1);
          if (source === target) throw new Error("Source and target day are the same");
          return store.modifyMany([source, target], `migrate open tasks to ${target}`, (entries) => {
            const from = entries.get(source)!;
            const open = journal.listTasks(from, policy).filter((t) => t.status === "open");
            const moved = open.map((t) => {
              const text = journal.markTaskMoved(from, t.ref, target, settings.template("task").template, policy);
              const task = render("task", text);
              return { text, ref: journal.addTask(entries.get(target)!, task.line, task.after) };
            });
            return { to: target, moved };
          });
        }),
    );
  }

  // --------------------------------------------------------- time entries

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
        store.modify(day(date), `time ${input.start}-${input.end} ${input.project}`, (lines) => {
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
          store.modify(day(date), "update time entry", (lines) => journal.updateTimeEntry(lines, ref, change, policy)),
        ),
    );
  }

  // ---------------------------------------------------------------- notes

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
        store.modify(day(date), heading ? `note ${heading}` : "add note", (lines) => {
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
          store.modify(day(date), `append ${heading}`, (lines) => {
            journal.appendNote(lines, heading, content, policy);
            return {};
          }),
        ),
    );
  }

  return server;
}
