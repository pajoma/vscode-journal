/** Tools for the notes area of daily and weekly entries (notes in scopes: see scopes.ts). */
import { z } from "zod";

import * as journal from "../journal/index.js";
import { args, run, type ToolContext } from "./context.js";

export function registerNoteTools(ctx: ToolContext): void {
  addNote(ctx);
  if (ctx.full) appendNote(ctx);
}

function addNote(ctx: ToolContext): void {
  ctx.server.registerTool(
    "add_note",
    {
      title: "Add note",
      description:
        "Appends markdown to the end of the notes of a daily or weekly entry, optionally under a new heading.",
      inputSchema: {
        date: args.date,
        period: args.period,
        content: z.string().describe("Markdown content"),
        heading: z.string().optional().describe("Optional heading for the new note"),
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
      description: "Appends markdown to the end of an existing heading's block in the notes area.",
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
