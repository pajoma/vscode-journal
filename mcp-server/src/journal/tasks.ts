/** Checklist tasks: open "[ ]", done "[x] … (done: …)", moved "[>] … (moved: …)" as the extension writes them. */
import { DONE_ANNOTATION, doneSuffix, LINE_KINDS, MOVED_SUFFIX, movedSuffix, openSubtasks, subtaskLines, subtasksToMove, TASK_BOX, withoutDone } from "journal-core";

import { templatePattern } from "../template.js";
import { JournalError, type Lines, lineRef, singleLine } from "./lines.js";
import type { VisibleLines } from "./privacy.js";
import { CHECKBOX, FENCE, headingContext, insertLine, isTask } from "./structure.js";


export type TaskStatus = "open" | "done" | "moved";

export interface Task {
  ref: string;
  status: TaskStatus;
  text: string;
  /** Heading the task is listed under. */
  section: string | null;
  /** Sub-tasks (#172): how many tasks this one is nested in; only set when nested. */
  level?: number;
  /** Sub-tasks (#172): the number of open sub-tasks; only set when there are some. */
  open_subtasks?: number;
}

function taskStatus(mark: string | undefined): TaskStatus {
  if (mark === ">") return "moved";
  return mark === "x" || mark === "X" ? "done" : "open";
}

export function listTasks(view: VisibleLines): Task[] {
  const { lines } = view;
  const hidden = view.hiddenMask();
  const context = headingContext(lines);
  const found: { i: number; m: RegExpExecArray }[] = [];
  let fenced = false;
  lines.forEach((line, i) => {
    if (FENCE.test(line)) fenced = !fenced;
    const m = fenced || hidden[i] ? null : CHECKBOX.exec(line);
    if (m && m[4].trim()) found.push({ i, m });
  });
  // every task below another one, as journal-core defines sub-tasks (#172)
  const level = lines.map(() => 0);
  for (const { i } of found) for (const j of subtaskLines(lines, i)) level[j]++;
  return found.map(({ i, m }) => {
    const open = openSubtasks(lines, i, (j) => !hidden[j]).length;
    return {
      ref: lineRef(lines, i),
      status: taskStatus(m[3]),
      text: m[4].trim(),
      section: context[i]?.text ?? null,
      ...(level[i] ? { level: level[i] } : {}),
      ...(open ? { open_subtasks: open } : {}),
    };
  });
}

/** Inserts a task line rendered from the `task` template, and the given sub-task lines directly below it (#172). */
export function addTask(lines: Lines, taskLine: string, after: string, subtasks: string[] = []): string {
  const line = singleLine(taskLine, "task");
  if (!isTask(line)) throw new JournalError("The task template must produce a markdown checkbox ('- [ ] ...')");
  // after the last task's block, not between a task and its sub-tasks
  const at = insertLine(lines, line, after, LINE_KINDS.task);
  lines.splice(at + 1, 0, ...subtasks);
  return lineRef(lines, at);
}

/**
 * Completes ("[x]" + "(done: <now>)", like the extension's code action), reopens or rewords a task.
 * Completing a task with open sub-tasks (#172) needs `subtasks`: true completes them too, false
 * only the task; without it the call fails, so the assistant asks the user, like the extension's
 * two quick fixes do.
 */
export function updateTask(
  view: VisibleLines,
  ref: string,
  change: { done?: boolean; text?: string; subtasks?: boolean },
  now: string,
): string {
  const { lines } = view;
  const i = view.resolveRef(ref);
  const m = CHECKBOX.exec(lines[i]);
  if (!m) throw new JournalError(`Ref '${ref}' does not point to a task`);
  const status = taskStatus(m[3]);
  if (change.done && status !== "done") {
    const hidden = view.hiddenMask();
    const open = openSubtasks(lines, i, (j) => !hidden[j]);
    if (open.length && change.subtasks === undefined) {
      throw new JournalError(
        `Task '${ref}' has ${open.length} open sub-task(s): ask the user whether to complete them too, then call again with subtasks true or false`,
      );
    }
    if (change.subtasks) for (const j of open) lines[j] = completed(lines[j], now);
  }
  const done = change.done ?? status === "done";
  const text = change.text !== undefined ? singleLine(change.text, "text") : m[4].trim();
  // "(done: …)" anywhere in the line, like the extension's reopen action (#277)
  const existingDone = status === "done" ? DONE_ANNOTATION.exec(m[4])?.[0].trim() : undefined;
  // a task that stays done keeps its completion time
  const content = done ? doneText(text, now, existingDone) : withoutDone(text).trim();
  const box = done ? TASK_BOX.done : status === "moved" && change.done === undefined ? TASK_BOX.moved : TASK_BOX.open;
  lines[i] = rewrite(m, box, content);
  return lineRef(lines, i);
}

/**
 * The refs of the open sub-tasks that go along when the task is moved (#172):
 * the same ones {@link markTaskMoved} takes, so that no other open task is
 * skipped by mistake. Open tasks below a done or private sub-task stay.
 */
export function subtasksMovedWith(view: VisibleLines, ref: string): string[] {
  const hidden = view.hiddenMask();
  return subtasksToMove(view.lines, view.resolveRef(ref), (j) => !hidden[j]).open.map((j) => lineRef(view.lines, j));
}

/** A task line with the given checkbox and text, keeping the line's indent and bullet. */
function rewrite(m: RegExpExecArray, box: string, text: string): string {
  return `${m[1]}${m[2]} ${box} ${text}`;
}

/** The text of a completed task: without any "(done: …)", then the kept or a new completion time at the end. */
function doneText(text: string, now: string, kept?: string): string {
  return withoutDone(text).trim() + (kept ? ` ${kept}` : doneSuffix(now));
}

/** An open task line completed at `now`. */
function completed(line: string, now: string): string {
  const m = CHECKBOX.exec(line)!;
  return rewrite(m, TASK_BOX.done, doneText(m[4], now));
}

/** Task text without checkbox, template decoration and done/moved suffixes. */
export function taskText(line: string, taskTemplate: string): string {
  const m = CHECKBOX.exec(line);
  let content = withoutDone(m ? m[4] : line).replace(MOVED_SUFFIX, "").trim();
  const tpl = CHECKBOX.exec(taskTemplate.split("\n")[0]);
  const input = templatePattern(tpl ? tpl[4] : taskTemplate).exec(content)?.[1];
  if (input?.trim()) content = input.trim();
  return content;
}

/**
 * Marks an open task as moved ("[>]" + "(moved: <date>)", like the extension's
 * "Plan for ..." code action), together with its open sub-tasks (#172), and
 * returns what goes to the target entry: the task's text and the sub-task lines
 * to insert below it. Done and private sub-tasks stay.
 */
export function markTaskMoved(
  view: VisibleLines,
  ref: string,
  target: string,
  taskTemplate: string,
): { text: string; subtasks: string[] } {
  const { lines } = view;
  const i = view.resolveRef(ref);
  const m = CHECKBOX.exec(lines[i]);
  if (!m) throw new JournalError(`Ref '${ref}' does not point to a task`);
  if (taskStatus(m[3]) !== "open") throw new JournalError(`Task '${ref}' is not open`);
  const text = taskText(lines[i], taskTemplate);
  const hidden = view.hiddenMask();
  const subtasks = subtasksToMove(lines, i, (j) => !hidden[j]);
  for (const j of [i, ...subtasks.open]) {
    const t = CHECKBOX.exec(lines[j])!;
    lines[j] = rewrite(t, TASK_BOX.moved, t[4].trim() + movedSuffix(target));
  }
  return { text, subtasks: subtasks.lines };
}
