/** Tools for whole daily and weekly entries: read one, the daily briefing, and memos. */
import { z } from "zod";

import { addDays, dateRange } from "../dates.js";
import * as journal from "../journal/index.js";
import type { Entry, EntryId, Period } from "../store.js";
import { adding, args, run, type Tool, type ToolContext } from "./context.js";
import { memos, noteTopics, tasksOf, timeSummary } from "./views.js";

/** An entry as memos, tasks, time entries (daily only) and notes. */
function describe(ctx: ToolContext, e: Entry) {
  return {
    period: e.period,
    entry: e.label,
    path: e.path,
    exists: e.exists,
    memos: memos(ctx, e.lines),
    tasks: journal.listTasks(ctx.view(e.lines)),
    ...(e.period === "daily" ? { time_entries: journal.listTimeEntries(ctx.view(e.lines)) } : {}),
    notes: ctx.cfg.notesReadable ? journal.readNotes(ctx.view(e.lines)) : "not readable (server configuration)",
  };
}

function getDailyJournal(ctx: ToolContext): void {
  ctx.server.registerTool(
    "get_daily_journal",
    {
      title: "Get daily journal",
      description: "Returns one day's entry structured as memos, tasks, time entries and notes.",
      inputSchema: { date: args.date },
      annotations: { readOnlyHint: true },
    },
    ({ date }) => run(async () => describe(ctx, await ctx.store.read(ctx.id(date, "daily")))),
  );
}

function getWeeklyJournal(ctx: ToolContext): void {
  ctx.server.registerTool(
    "get_weekly_journal",
    {
      title: "Get weekly journal",
      description: "Returns the weekly entry of the week containing 'date': memos, tasks and notes.",
      inputSchema: { date: args.date },
      annotations: { readOnlyHint: true },
    },
    ({ date }) => run(async () => describe(ctx, await ctx.store.read(ctx.id(date, "weekly")))),
  );
}

function getDailyBriefing(ctx: ToolContext): void {
  ctx.server.registerTool(
    "get_daily_briefing",
    {
      title: "Daily briefing",
      description:
        "Facts for a daily briefing: memos and tasks of the day and of the current week, open tasks carried over from previous days and the previous week, time booked, note topics. Summarise them for the user.",
      inputSchema: {
        date: args.date,
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
    ({ date, lookback_days = 7 }) => run(() => briefing(ctx, ctx.day(date), lookback_days)),
  );
}

/** The day, its week, and the open tasks of the previous days and the previous week. */
async function briefing(ctx: ToolContext, target: string, lookbackDays: number) {
  const { store } = ctx;
  const thisWeek: EntryId = { period: "weekly", date: target };
  const lastWeek = store.shift(thisWeek, -1);
  const previousDays = dateRange(addDays(target, -lookbackDays), target).slice(0, -1);
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
  const open = (e: Entry) => tasksOf(ctx, e).filter((t) => t.status === "open");
  const done = (e: Entry) =>
    tasksOf(ctx, e)
      .filter((t) => t.status === "done")
      .map((t) => t.text);
  const time = journal.listTimeEntries(ctx.view(today.lines));
  return {
    date: target,
    day: {
      exists: today.exists,
      memos: memos(ctx, today.lines).map((m) => m.text),
      open_tasks: open(today),
      done_tasks: done(today),
      time: { entries: time, ...timeSummary(time) },
      note_topics: noteTopics(ctx, today),
    },
    week: {
      entry: week.label,
      exists: week.exists,
      memos: memos(ctx, week.lines).map((m) => m.text),
      open_tasks: open(week),
      done_tasks: done(week),
      note_topics: noteTopics(ctx, week),
    },
    carried_over: {
      daily: entries.filter((e) => e.period === "daily" && e !== today).flatMap(open),
      weekly: open(previousWeek),
    },
  };
}

function addMemo(ctx: ToolContext): void {
  ctx.server.registerTool(
    "add_memo",
    {
      title: "Add memo",
      description:
        "Adds a one-line memo (reminder) to a daily or weekly entry, rendered with the user's memo template.",
      inputSchema: { date: args.date, period: args.period, text: z.string().describe("Memo text, single line") },
    },
    ({ date, period, text }) =>
      run(() =>
        ctx.store.modify(ctx.id(date, period), "add memo", (lines) => {
          const memo = ctx.render("memo", text);
          return { ref: journal.addMemo(lines, memo.line, memo.after, memo.template) };
        }),
      ),
  );
}

/** Entry tools; a write-only token may only add memos. */
export const entryTools: Tool[] = [getDailyJournal, getWeeklyJournal, getDailyBriefing, adding(addMemo)];
