/** How tool results show entries: task, memo, time and note views shared by several tool groups. */
import * as journal from "../journal/index.js";
import type { Entry } from "../store.js";
import type { ToolContext } from "./context.js";

/** The tasks of an entry, labelled with the entry. */
export function tasksOf(ctx: ToolContext, e: Entry) {
  return journal.listTasks(ctx.view(e.lines)).map((t) => ({ period: e.period, entry: e.label, ...t }));
}

/**
 * Numbers tasks 1, 2, 3 … in the order they appear in one result, so the user
 * can answer "complete 3": the assistant maps the number back to the task's ref.
 * One numbering per result; call it for every task list of that result in order.
 */
export function taskNumbering() {
  let no = 0;
  return <T extends object>(tasks: T[]): (T & { no: number })[] => tasks.map((t) => ({ no: ++no, ...t }));
}

/** The memos of an entry, recognised by the user's memo template. */
export function memos(ctx: ToolContext, lines: journal.Lines) {
  return journal.listMemos(ctx.view(lines), ctx.cfg.journal.getMemoInlineTemplate().template);
}

/** The headings of an entry's notes, if notes are readable. */
export function noteTopics(ctx: ToolContext, e: Entry): string[] {
  return ctx.cfg.notesReadable ? journal.readNotes(ctx.view(e.lines)).headings.map((h) => h.text) : [];
}

/** Total hours and hours per project. */
export function timeSummary(rows: { project: string; hours: number | null }[]) {
  const byProject: Record<string, number> = {};
  for (const r of rows) byProject[r.project] = (byProject[r.project] ?? 0) + (r.hours ?? 0);
  return { total_hours: Object.values(byProject).reduce((a, b) => a + b, 0), hours_by_project: byProject };
}
