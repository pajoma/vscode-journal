/** Checklist tasks: open "[ ]", done "[x] … (done: …)", moved "[>] … (moved: …)" as the extension writes them. */
import { DONE_ANNOTATION, doneSuffix, MOVED_SUFFIX, movedSuffix, TASK_BOX, withoutDone } from "journal-core";

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
}

function taskStatus(mark: string | undefined): TaskStatus {
  if (mark === ">") return "moved";
  return mark === "x" || mark === "X" ? "done" : "open";
}

export function listTasks(view: VisibleLines): Task[] {
  const { lines } = view;
  const hidden = view.hiddenMask();
  const context = headingContext(lines);
  const tasks: Task[] = [];
  let fenced = false;
  lines.forEach((line, i) => {
    if (FENCE.test(line)) fenced = !fenced;
    const m = fenced || hidden[i] ? null : CHECKBOX.exec(line);
    if (m && m[4].trim()) {
      tasks.push({
        ref: lineRef(lines, i),
        status: taskStatus(m[3]),
        text: m[4].trim(),
        section: context[i]?.text ?? null,
      });
    }
  });
  return tasks;
}

/** Inserts a task line rendered from the `task` template. */
export function addTask(lines: Lines, taskLine: string, after: string): string {
  const line = singleLine(taskLine, "task");
  if (!isTask(line)) throw new JournalError("The task template must produce a markdown checkbox ('- [ ] ...')");
  return lineRef(lines, insertLine(lines, line, after, isTask));
}

/** Completes ("[x]" + "(done: <now>)", like the extension's code action), reopens or rewords a task. */
export function updateTask(
  view: VisibleLines,
  ref: string,
  change: { done?: boolean; text?: string },
  now: string,
): string {
  const { lines } = view;
  const i = view.resolveRef(ref);
  const m = CHECKBOX.exec(lines[i]);
  if (!m) throw new JournalError(`Ref '${ref}' does not point to a task`);
  const status = taskStatus(m[3]);
  const done = change.done ?? status === "done";
  const text = change.text !== undefined ? singleLine(change.text, "text") : m[4].trim();
  // "(done: …)" anywhere in the line, like the extension's reopen action (#277)
  const existingDone = status === "done" ? DONE_ANNOTATION.exec(m[4])?.[0].trim() : undefined;
  let content = withoutDone(text).trim();
  // a task that stays done keeps its completion time, at the end of the line
  if (done) content += existingDone ? ` ${existingDone}` : doneSuffix(now);
  const mark = done ? "x" : status === "moved" && change.done === undefined ? ">" : " ";
  lines[i] = `${m[1]}${m[2]} [${mark}] ${content}`;
  return lineRef(lines, i);
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
 * "Plan for ..." code action) and returns its text for the target entry.
 */
export function markTaskMoved(view: VisibleLines, ref: string, target: string, taskTemplate: string): string {
  const { lines } = view;
  const i = view.resolveRef(ref);
  const m = CHECKBOX.exec(lines[i]);
  if (!m) throw new JournalError(`Ref '${ref}' does not point to a task`);
  if (taskStatus(m[3]) !== "open") throw new JournalError(`Task '${ref}' is not open`);
  const text = taskText(lines[i], taskTemplate);
  lines[i] = `${m[1]}${m[2]} ${TASK_BOX.moved} ${m[4].trim()}${movedSuffix(target)}`;
  return text;
}
