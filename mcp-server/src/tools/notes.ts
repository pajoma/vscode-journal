/** Tools for the notes area of daily and weekly entries (notes in scopes: see scopes.ts). */
import { z } from "zod";

import * as journal from "../journal/index.js";
import { adding, args, run, type Tool, type ToolContext } from "./context.js";

function addToJournalEntry(ctx: ToolContext): void {
  ctx.server.registerTool(
    "add_to_journal_entry",
    {
      title: "Add to journal entry",
      description:
        "Writes markdown into the daily or weekly entry itself: appended to the end of its notes area, optionally under a new heading. For a separate note (own file, only linked from the entry) use create_note.",
      inputSchema: {
        date: args.date,
        period: args.period,
        content: z.string().describe("Markdown content"),
        heading: z.string().optional().describe("Optional heading for the new block"),
        level: z.number().int().min(2).max(6).optional().describe("Heading level, default 2"),
      },
    },
    ({ date, period, content, heading, level }) =>
      run(() =>
        ctx.store.modify(ctx.id(date, period), heading ? `note ${heading}` : "add note", (lines) => {
          journal.addNote(ctx.view(lines), content, heading, level);
          return {};
        }),
      ),
  );
}

function appendNote(ctx: ToolContext): void {
  ctx.server.registerTool(
    "append_note",
    {
      title: "Append to note",
      description: "Appends markdown to the end of an existing heading's block in the notes area of a daily or weekly entry.",
      inputSchema: {
        date: args.date,
        period: args.period,
        heading: z.string().describe("Existing heading text, exactly as listed by get_daily_journal"),
        content: z.string().describe("Markdown content"),
      },
    },
    ({ date, period, heading, content }) =>
      run(() =>
        ctx.store.modify(ctx.id(date, period), `append ${heading}`, (lines) => {
          journal.appendNote(ctx.view(lines), heading, content);
          return {};
        }),
      ),
  );
}

/** Tools for the notes area of entries; a write-only token may only add to it. */
export const noteTools: Tool[] = [adding(addToJournalEntry), appendNote];
