/** Tools for checklist tasks: list, add, complete/reopen/reword, move, migrate. */
import { DONE_TIME_FORMAT } from "journal-core";
import { z } from "zod";

import * as journal from "../journal/index.js";
import type { Period } from "../store.js";
import { adding, args, run, type Tool, type ToolContext } from "./context.js";
import { taskNumbering, tasksOf } from "./views.js";

const taskTemplate = (ctx: ToolContext) => ctx.cfg.journal.getTaskInlineTemplate().template;

function listTasks(ctx: ToolContext): void {
  ctx.server.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description:
        "Lists checklist tasks of daily and/or weekly entries over a date range, with the heading each task is listed under. Tasks are numbered ('no'): show the numbers.",
      inputSchema: {
        ...args.range,
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
        const entries = await ctx.store.readMany(
          ctx.days(from, to).flatMap((d) => periods.map((p) => ({ period: p, date: d }))),
        );
        return taskNumbering()(entries.flatMap((e) => tasksOf(ctx, e)).filter((t) => status === "all" || t.status === status));
      }),
  );
}

function addTask(ctx: ToolContext): void {
  const { date, period } = args;
  ctx.server.registerTool(
    "add_task",
    {
      title: "Add task",
      description: "Adds an open task to a daily or weekly entry, rendered with the user's task template.",
      inputSchema: { date, period, text: z.string().describe("Task text, single line") },
    },
    ({ date, period, text }) =>
      run(() =>
        ctx.store.modify(ctx.id(date, period), "add task", (lines) => {
          const task = ctx.render("task", text);
          return { ref: journal.addTask(lines, task.line, task.after) };
        }),
      ),
  );
}

function updateTask(ctx: ToolContext): void {
  const { date, period, ref } = args;
  ctx.server.registerTool(
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
        ctx.store.modify(ctx.id(date, period), "update task", (lines) => ({
          ref: journal.updateTask(ctx.view(lines), ref, { done, text }, ctx.now().format(DONE_TIME_FORMAT)),
        })),
      ),
  );
}

function moveTask(ctx: ToolContext): void {
  const { date, period, ref } = args;
  ctx.server.registerTool(
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
        const source = ctx.id(date, period);
        const target = ctx.id(to, to_period ?? source.period);
        const label = ctx.store.label(target);
        return ctx.store.modifyMany([source, target], `move task to ${label}`, ([from, into]) => {
          const text = journal.markTaskMoved(ctx.view(from), ref, label, taskTemplate(ctx));
          const task = ctx.render("task", text);
          return { text, to: label, ref: journal.addTask(into, task.line, task.after) };
        });
      }),
  );
}

function migrateOpenTasks(ctx: ToolContext): void {
  const { date, period } = args;
  ctx.server.registerTool(
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
        const source = ctx.id(date, period);
        const target = to ? ctx.id(to, to_period ?? source.period) : ctx.store.shift(source, 1);
        const label = ctx.store.label(target);
        return ctx.store.modifyMany([source, target], `migrate open tasks to ${label}`, ([from, into]) => {
          const open = journal.listTasks(ctx.view(from)).filter((t) => t.status === "open");
          const moved = open.map((t) => {
            const text = journal.markTaskMoved(ctx.view(from), t.ref, label, taskTemplate(ctx));
            const task = ctx.render("task", text);
            return { text, ref: journal.addTask(into, task.line, task.after) };
          });
          return { to: label, moved };
        });
      }),
  );
}

/** Task tools; a write-only token may only add tasks. */
export const taskTools: Tool[] = [listTasks, adding(addTask), updateTask, moveTask, migrateOpenTasks];
