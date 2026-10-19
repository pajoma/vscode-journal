/** Tools for the time tracking table (Zeiterfassung) of daily entries. */
import { z } from "zod";

import * as journal from "../journal/index.js";
import type { EntryId } from "../store.js";
import { adding, args, run, type Tool, type ToolContext } from "./context.js";
import { timeSummary } from "./views.js";

const timeFields = {
  start: z.string().describe("HH:MM"),
  end: z.string().describe("HH:MM, after start"),
  project: z.string().describe("Customer / project"),
  description: z.string().describe("Activity"),
};

function listTimeEntries(ctx: ToolContext): void {
  ctx.server.registerTool(
    "list_time_entries",
    {
      title: "List time entries",
      description: "Lists time tracking rows (Zeiterfassung) over a date range, with hours per project.",
      inputSchema: {
        ...args.range,
        project: z.string().optional().describe("Only projects containing this text (case-insensitive)"),
        detail: args.detail,
      },
      annotations: { readOnlyHint: true },
    },
    ({ from, to, project, detail }) =>
      run(async () => {
        const entries = await ctx.store.readMany(
          ctx.days(from, to).map((d): EntryId => ({ period: "daily", date: d })),
        );
        const needle = project?.toLowerCase();
        const rows = entries.flatMap((e) =>
          journal
            .listTimeEntries(ctx.view(e.lines))
            .filter((t) => !needle || t.project.toLowerCase().includes(needle))
            .map((t) => ({ date: e.date, ...t })),
        );
        // in brief (#301) only the hours, without the rows
        return detail === "brief" ? timeSummary(rows) : { entries: rows, ...timeSummary(rows) };
      }),
  );
}

function addTimeEntry(ctx: ToolContext): void {
  ctx.server.registerTool(
    "add_time_entry",
    {
      title: "Add time entry",
      description: "Adds a time interval to a day's Zeiterfassung table. Overlaps are reported as warnings.",
      inputSchema: { date: args.date, ...timeFields },
    },
    ({ date, ...input }) =>
      run(() =>
        ctx.store.modify(ctx.id(date), `time ${input.start}-${input.end} ${input.project}`, (lines) => {
          const result = journal.addTimeEntry(ctx.view(lines), input);
          // a write-only client must not learn about existing entries through warnings
          return ctx.full ? result : { ref: result.ref, overlapping_entries: result.warnings.length };
        }),
      ),
  );
}

function updateTimeEntry(ctx: ToolContext): void {
  ctx.server.registerTool(
    "update_time_entry",
    {
      title: "Update time entry",
      description: "Corrects fields of an existing time entry; omitted fields stay unchanged.",
      inputSchema: {
        date: args.date,
        ref: args.ref,
        start: timeFields.start.optional(),
        end: timeFields.end.optional(),
        project: timeFields.project.optional(),
        description: timeFields.description.optional(),
      },
    },
    ({ date, ref, ...change }) =>
      run(() =>
        ctx.store.modify(ctx.id(date), "update time entry", (lines) =>
          journal.updateTimeEntry(ctx.view(lines), ref, change),
        ),
      ),
  );
}

/** Time tracking tools; a write-only token may only add time entries. */
export const timeTools: Tool[] = [listTimeEntries, adding(addTimeEntry), updateTimeEntry];
