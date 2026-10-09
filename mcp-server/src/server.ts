import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { Config } from "./config.js";
import { addDays, dateRange, resolveDate as resolveDay } from "./dates.js";
import * as journal from "./journal.js";
import type { TemplateName } from "./settings.js";
import type { Entry, EntryId, JournalStore, Period } from "./store.js";
import { nowMoment, replaceVariable, resolveDate } from "./template.js";

const INSTRUCTIONS = `Tools for a personal markdown journal with one file per day (daily entries) and one file per
week (weekly entries). Tasks, memos and notes live in either; pass period "weekly" to work on the
week that contains the given date. Time entries only exist in daily entries.
Workflow for changes to existing entries: read first (get_daily_journal, get_weekly_journal,
list_tasks, list_time_entries), pick the entry yourself, ask the user if several entries match,
then call the update tool with the returned "ref" and the same period. Refs are temporary: after
any change to the same line they become stale and the tool returns an error; read again then.
Dates are YYYY-MM-DD or today / yesterday / tomorrow. For a morning overview use
get_daily_briefing. Content the user tagged as private is never returned.`;

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
  const taskTemplate = () => settings.template("task").template;

  const date = z.string().optional().describe("YYYY-MM-DD, 'today', 'yesterday' or 'tomorrow' (default: today)");
  const period = z
    .enum(["daily", "weekly"])
    .optional()
    .describe("'daily' (default): the day's entry; 'weekly': the weekly entry of the week containing 'date'");
  const ref = z.string().describe("Temporary ref of the entry, as returned by a read tool");
  const range = {
    from: z.string().optional().describe("First day, YYYY-MM-DD or keyword (default: today)"),
    to: z.string().optional().describe("Last day, inclusive (default: same as 'from'); max. 92 days"),
  };
  const day = (value?: string) => resolveDay(value, tz);
  const id = (value?: string, p: Period = "daily"): EntryId => ({ period: p, date: day(value) });
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
  const tasksOf = (e: Entry) =>
    journal.listTasks(e.lines, policy).map((t) => ({ period: e.period, entry: e.label, ...t }));
  const noteTopics = (e: Entry) =>
    cfg.notesReadable ? journal.readNotes(e.lines, policy).headings.map((h) => h.text) : [];
  const describe = (e: Entry) => ({
    period: e.period,
    entry: e.label,
    path: e.path,
    exists: e.exists,
    memos: memos(e.lines),
    tasks: journal.listTasks(e.lines, policy),
    ...(e.period === "daily" ? { time_entries: journal.listTimeEntries(e.lines, policy) } : {}),
    notes: cfg.notesReadable ? journal.readNotes(e.lines, policy) : "not readable (server configuration)",
  });

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
      ({ date }) => run(async () => describe(await store.read(id(date)))),
    );

    server.registerTool(
      "get_weekly_journal",
      {
        title: "Get weekly journal",
        description: "Returns the weekly entry of the week containing 'date': memos, tasks and notes.",
        inputSchema: { date },
        annotations: { readOnlyHint: true },
      },
      ({ date }) => run(async () => describe(await store.read(id(date, "weekly")))),
    );

    server.registerTool(
      "get_daily_briefing",
      {
        title: "Daily briefing",
        description:
          "Facts for a daily briefing: memos and tasks of the day and of the current week, open tasks carried over from previous days and the previous week, time booked, note topics. Summarise them for the user.",
        inputSchema: {
          date,
          lookback_days: z
            .number()
            .int()
            .min(0)
            .max(31)
            .optional()
            .describe("Previous days to scan for open daily tasks (default 7)"),
        },
        annotations: { readOnlyHint: true },
      },
      ({ date, lookback_days = 7 }) =>
        run(async () => {
          const target = day(date);
          const thisWeek: EntryId = { period: "weekly", date: target };
          const lastWeek = store.shift(thisWeek, -1);
          const previousDays = dateRange(addDays(target, -lookback_days), target).slice(0, -1);
          const entries = await store.readMany([
            { period: "daily", date: target },
            thisWeek,
            lastWeek,
            ...previousDays.map((d): EntryId => ({ period: "daily", date: d })),
          ]);
          const find = (p: Period, label: string) => entries.find((e) => e.period === p && e.label === label)!;
          const today = find("daily", target);
          const week = find("weekly", store.label(thisWeek));
          const previousWeek = find("weekly", store.label(lastWeek));
          const open = (e: Entry) => tasksOf(e).filter((t) => t.status === "open");
          const done = (e: Entry) =>
            tasksOf(e)
              .filter((t) => t.status === "done")
              .map((t) => t.text);
          const time = journal.listTimeEntries(today.lines, policy);
          return {
            date: target,
            day: {
              exists: today.exists,
              memos: memos(today.lines).map((m) => m.text),
              open_tasks: open(today),
              done_tasks: done(today),
              time: { entries: time, ...timeSummary(time) },
              note_topics: noteTopics(today),
            },
            week: {
              entry: week.label,
              exists: week.exists,
              memos: memos(week.lines).map((m) => m.text),
              open_tasks: open(week),
              done_tasks: done(week),
              note_topics: noteTopics(week),
            },
            carried_over: {
              daily: entries.filter((e) => e.period === "daily" && e !== today).flatMap(open),
              weekly: open(previousWeek),
            },
          };
        }),
    );

    server.registerTool(
      "list_tasks",
      {
        title: "List tasks",
        description:
          "Lists checklist tasks of daily and/or weekly entries over a date range, with the heading each task is listed under.",
        inputSchema: {
          ...range,
          status: z.enum(["open", "done", "moved", "all"]).optional().describe("Default: open"),
          period: z
            .enum(["daily", "weekly", "all"])
            .optional()
            .describe("Daily entries, weekly entries of the weeks in the range, or both (default)"),
        },
        annotations: { readOnlyHint: true },
      },
      ({ from, to, status = "open", period = "all" }) =>
        run(async () => {
          const periods: Period[] = period === "all" ? ["daily", "weekly"] : [period];
          const entries = await store.readMany(
            days(from, to).flatMap((d) => periods.map((p) => ({ period: p, date: d }))),
          );
          return entries.flatMap(tasksOf).filter((t) => status === "all" || t.status === status);
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
          const entries = await store.readMany(days(from, to).map((d): EntryId => ({ period: "daily", date: d })));
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
      description:
        "Adds a one-line memo (reminder) to a daily or weekly entry, rendered with the user's memo template.",
      inputSchema: { date, period, text: z.string().describe("Memo text, single line") },
    },
    ({ date, period, text }) =>
      run(() =>
        store.modify(id(date, period), "add memo", (lines) => {
          const memo = render("memo", text);
          return { ref: journal.addMemo(lines, memo.line, memo.after, memo.template) };
        }),
      ),
  );

  server.registerTool(
    "add_task",
    {
      title: "Add task",
      description: "Adds an open task to a daily or weekly entry, rendered with the user's task template.",
      inputSchema: { date, period, text: z.string().describe("Task text, single line") },
    },
    ({ date, period, text }) =>
      run(() =>
        store.modify(id(date, period), "add task", (lines) => {
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
          period,
          ref,
          done: z.boolean().optional().describe("true = completed, false = reopen"),
          text: z.string().optional().describe("New task text"),
        },
      },
      ({ date, period, ref, done, text }) =>
        run(() =>
          store.modify(id(date, period), "update task", (lines) => ({
            ref: journal.updateTask(lines, ref, { done, text }, now().format("YYYY-MM-DD HH:mm"), policy),
          })),
        ),
    );

    server.registerTool(
      "move_task",
      {
        title: "Move task",
        description:
          "Moves an open task to another day or week: marks it '[>] ... (moved: <target>)' and adds it to the target entry. Works between daily and weekly entries.",
        inputSchema: {
          date,
          period,
          ref,
          to: z.string().describe("Target day (or a day of the target week), YYYY-MM-DD or keyword"),
          to_period: period.describe("Target entry type (default: same as 'period')"),
        },
      },
      ({ date, period, ref, to, to_period }) =>
        run(() => {
          const source = id(date, period);
          const target = id(to, to_period ?? source.period);
          const label = store.label(target);
          return store.modifyMany([source, target], `move task to ${label}`, ([from, into]) => {
            const text = journal.markTaskMoved(from, ref, label, taskTemplate(), policy);
            const task = render("task", text);
            return { text, to: label, ref: journal.addTask(into, task.line, task.after) };
          });
        }),
    );

    server.registerTool(
      "migrate_open_tasks",
      {
        title: "Migrate open tasks",
        description:
          "Moves all open tasks of a daily or weekly entry to another entry (default: the next day, or the next week for weekly entries).",
        inputSchema: {
          date,
          period,
          to: z.string().optional().describe("Target day or a day of the target week (default: next day / next week)"),
          to_period: period.describe("Target entry type (default: same as 'period')"),
        },
      },
      ({ date, period, to, to_period }) =>
        run(() => {
          const source = id(date, period);
          const target = to ? id(to, to_period ?? source.period) : store.shift(source, 1);
          const label = store.label(target);
          return store.modifyMany([source, target], `migrate open tasks to ${label}`, ([from, into]) => {
            const open = journal.listTasks(from, policy).filter((t) => t.status === "open");
            const moved = open.map((t) => {
              const text = journal.markTaskMoved(from, t.ref, label, taskTemplate(), policy);
              const task = render("task", text);
              return { text, ref: journal.addTask(into, task.line, task.after) };
            });
            return { to: label, moved };
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
        store.modify(id(date), `time ${input.start}-${input.end} ${input.project}`, (lines) => {
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
          store.modify(id(date), "update time entry", (lines) => journal.updateTimeEntry(lines, ref, change, policy)),
        ),
    );
  }

  // ---------------------------------------------------------------- notes

  server.registerTool(
    "add_note",
    {
      title: "Add note",
      description:
        "Appends markdown to the end of the notes of a daily or weekly entry, optionally under a new heading.",
      inputSchema: {
        date,
        period,
        content: z.string().describe("Markdown content"),
        heading: z.string().optional().describe("Optional heading for the new note"),
        level: z.number().int().min(2).max(6).optional().describe("Heading level, default 2"),
      },
    },
    ({ date, period, content, heading, level }) =>
      run(() =>
        store.modify(id(date, period), heading ? `note ${heading}` : "add note", (lines) => {
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
          period,
          heading: z.string().describe("Existing heading text, exactly as listed by get_daily_journal"),
          content: z.string().describe("Markdown content"),
        },
      },
      ({ date, period, heading, content }) =>
        run(() =>
          store.modify(id(date, period), `append ${heading}`, (lines) => {
            journal.appendNote(lines, heading, content, policy);
            return {};
          }),
        ),
    );
  }

  return server;
}
